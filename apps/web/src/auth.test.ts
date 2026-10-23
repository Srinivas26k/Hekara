import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  argon2idHasher, createPgAudit, createPgRealtime, createPgRepository, envSecrets, fsBlob, intervalScheduler, memoryQueue, systemClock,
} from "@hekara/adapters-node";
import { createCrypto, generateMasterKey, masterKeyProvider } from "@hekara/crypto";
import * as s from "@hekara/db/schema";
import type { Ports } from "@hekara/ports";
import { createApp } from "./app";
import { createAuth } from "./auth";
import { identifyFromSession } from "./identity";
import { createInvites } from "./invites";

const url = process.env.DATABASE_URL ?? "postgres://hekara:hekara@localhost:5442/hekara";
const APP = "http://localhost:3000";
const PASSWORD = "a-long-test-password-1";
const sql = postgres(url, { max: 5 });
const db = drizzle(sql, { schema: s });
const hasher = argon2idHasher({ memory: 1024, passes: 1 }); // small parameters keep tests fast
const crypto = createCrypto(masterKeyProvider({ t: generateMasterKey() }, "t"));
const ports: Ports = {
  clock: systemClock, secrets: envSecrets, crypto, repo: createPgRepository(db, crypto), audit: createPgAudit(db, crypto),
  realtime: createPgRealtime(sql), queue: memoryQueue(), blob: fsBlob("./.data/test-blobs"), scheduler: intervalScheduler(),
};
const { auth, links } = createAuth({ db, hasher, audit: ports.audit, appUrl: APP, secret: "x".repeat(40) });
const app = createApp({
  ports, identify: identifyFromSession(auth), authHandler: (r) => auth.handler(r),
  invites: createInvites({ auth, links, db, appUrl: APP }), clientKey: () => "test", allowedOrigin: APP, allowTimeTravel: true,
});

let A = "", B = "";
const users: Record<string, { id: string; email: string }> = {};
let ipSeq = 0;
const nextIp = () => `10.0.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;
const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
const at = (h: number) => new Date(midnight.getTime() + h * 3_600_000);

const post = (path: string, body: unknown, headers: Record<string, string> = {}, origin: string | null = APP) =>
  app.request(path, {
    method: "POST", body: JSON.stringify(body),
    headers: { "content-type": "application/json", "x-forwarded-for": nextIp(), ...(origin ? { origin } : {}), ...headers },
  });
const cookieOf = (r: Response) =>
  r.headers.getSetCookie().map((c) => c.split(";")[0]).filter((c) => c && !c.endsWith("=")).join("; ");
const signIn = (email: string, password = PASSWORD, ip = nextIp()) =>
  post("/api/auth/sign-in/email", { email, password }, { "x-forwarded-for": ip });
async function login(email: string): Promise<string> {
  const r = await signIn(email);
  expect(r.status).toBe(200);
  return cookieOf(r);
}
const get = (path: string, cookie?: string) => app.request(path, { headers: cookie ? { cookie } : {} });
const call = (method: "GET" | "POST", path: string, cookie: string, body?: unknown) =>
  app.request(path, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { cookie, origin: APP, "content-type": "application/json" },
  });

async function mkUser(name: string, role: "admin" | "scheduler" | "caregiver" | "billing", agencyId = A, caregiverId: string | null = null) {
  const id = crypto_id();
  const email = `${name}-${id.slice(0, 8)}@example.test`;
  await db.insert(s.user).values({ id, name, email, emailVerified: true, role, agencyId, caregiverId });
  await db.insert(s.account).values({ id: crypto_id(), accountId: id, providerId: "credential", userId: id, password: await hasher.hash(PASSWORD) });
  users[name] = { id, email };
  return email;
}
const crypto_id = () => globalThis.crypto.randomUUID();

let cg1 = "", cg2 = "";
beforeAll(async () => {
  [A, B] = await Promise.all([0, 1].map(async () => (await db.insert(s.agencies).values({ name: "Auth Test Agency" }).returning())[0]!.id)) as [string, string];
  const mk = async (name: string, i: number) => (await db.insert(s.caregivers).values({
    agencyId: A, name: await crypto.encrypt(A, name), skills: ["HHA"], createdAt: new Date(Date.now() + i),
  }).returning())[0]!.id;
  cg1 = await mk("Maria Lopez", 0); cg2 = await mk("James Carter", 1);
  const visit = async (cg: string, label: string, h: number) => db.insert(s.visits).values({
    agencyId: A, caregiverId: cg, label: await crypto.encrypt(A, label), startsAt: at(h), endsAt: at(h + 1), status: "scheduled",
  });
  await visit(cg1, "Dorothy Nguyen", 9); await visit(cg2, "Helen Park", 10);
  await mkUser("admin", "admin"); await mkUser("scheduler", "scheduler"); await mkUser("billing", "billing");
  await mkUser("caregiver", "caregiver", A, cg1); await mkUser("floater", "caregiver", A, null);
  await mkUser("outsider", "admin", B);
});

afterAll(async () => {
  for (const id of [A, B]) {
    await db.delete(s.auditLog).where(eq(s.auditLog.agencyId, id));
    await db.delete(s.user).where(eq(s.user.agencyId, id)); // cascades to sessions and accounts
    await db.delete(s.agencies).where(eq(s.agencies.id, id));
  }
  await sql.end({ timeout: 1 });
});

describe("sign-in", () => {
  it("rejects requests with no session", async () => {
    const r = await get("/api/overview");
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: { code: "unauthenticated", message: "Sign in required" } });
    expect((await get("/api/me", "hekara.session_token=forged")).status).toBe(401);
  });

  it("signs in and returns a hardened session cookie", async () => {
    const r = await signIn(users.admin!.email);
    expect(r.status).toBe(200);
    const raw = r.headers.getSetCookie().find((c) => c.includes("session_token"))!;
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Strict/i);
    expect(raw).not.toMatch(/Secure/i); // http in tests; Secure is on whenever APP_URL is https
    expect(raw).toMatch(/Max-Age=1800/i); // 30 minute idle window
    const me = await (await get("/api/me", cookieOf(r))).json() as any;
    expect(me).toMatchObject({ role: "admin", agencyId: A, twoFactorEnabled: false });
    expect(me.id).toBe(users.admin!.id);
  });

  it("answers wrong passwords and unknown emails identically", async () => {
    const wrong = await signIn(users.admin!.email, "not-the-password-123");
    const unknown = await signIn("nobody@example.test", "not-the-password-123");
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    const [a, b] = [await wrong.json() as any, await unknown.json() as any];
    expect(a.message).toBe(b.message);
    expect(a.code).toBe(b.code);
  });

  it("rate limits repeated sign-in attempts from one address", async () => {
    const ip = "203.0.113.77";
    const codes: number[] = [];
    for (let i = 0; i < 8; i++) codes.push((await signIn(users.admin!.email, "wrong-password-12345", ip)).status);
    expect(codes.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(codes.slice(5).every((c) => c === 429)).toBe(true);
  });

  it("locks an account after repeated failures even when the attacker rotates addresses", async () => {
    const victim = await mkUser("victim", "scheduler");
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await signIn(victim, "wrong-password-12345", nextIp())).status); // new IP every time
    expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
    expect(codes.slice(10)).toEqual([429, 429]);
    expect((await signIn(victim, PASSWORD, nextIp())).status).toBe(429); // even the right password waits
    expect((await signIn(users.admin!.email, PASSWORD, nextIp())).status).toBe(200); // other accounts are unaffected
  });

  it("blocks cross-origin sign-in and self-signup", async () => {
    expect((await post("/api/auth/sign-in/email", { email: users.admin!.email, password: PASSWORD }, {}, "https://evil.example")).status).toBe(403);
    expect((await post("/api/auth/sign-in/email", { email: users.admin!.email, password: PASSWORD }, {}, null)).status).toBe(403);
    const signup = await post("/api/auth/sign-up/email", { email: "new@example.test", password: PASSWORD, name: "New" });
    expect(signup.status).toBeGreaterThanOrEqual(400);
    expect(await db.select().from(s.user).where(eq(s.user.email, "new@example.test"))).toEqual([]);
  });

  it("ends the session on sign-out", async () => {
    const cookie = await login(users.scheduler!.email);
    expect((await get("/api/me", cookie)).status).toBe(200);
    expect((await call("POST", "/api/auth/sign-out", cookie, {})).status).toBe(200);
    expect((await get("/api/me", cookie)).status).toBe(401);
  });

  it("expires sessions after 12 hours even when they stay active", async () => {
    const cookie = await login(users.billing!.email);
    expect((await get("/api/me", cookie)).status).toBe(200);
    await db.update(s.session).set({ createdAt: new Date(Date.now() - 13 * 3_600_000) }).where(eq(s.session.userId, users.billing!.id));
    const r = await get("/api/me", cookie);
    expect(r.status).toBe(401);
    expect(((await r.json()) as any).error.code).toBe("session_expired");
  });
});

describe("roles", () => {
  it("lets staff use the schedule tools", async () => {
    const cookie = await login(users.scheduler!.email);
    expect((await get("/api/overview?at=10:00", cookie)).status).toBe(200);
    expect((await get("/api/schedule?at=10:00", cookie)).status).toBe(200);
    expect((await call("POST", "/api/patients", cookie, { name: "Role Test" })).status).toBe(201);
  });

  it("denies billing staff the scheduling tools", async () => {
    const cookie = await login(users.billing!.email);
    for (const [m, p] of [["GET", "/api/overview"], ["GET", "/api/schedule"], ["GET", "/api/search?q=ab"], ["POST", "/api/optimize"],
      ["POST", "/api/suggestions/apply"], ["POST", "/api/patients"], ["GET", "/api/admin/users"]] as const) {
      const r = await call(m, p, cookie, m === "POST" ? { name: "x" } : undefined);
      expect([p, r.status]).toEqual([p, 403]);
    }
    expect((await get("/api/me", cookie)).status).toBe(200);
  });

  it("shows caregivers only their own visits and blocks everything else", async () => {
    const cookie = await login(users.caregiver!.email);
    const d = await (await get(`/api/schedule?at=10:00&caregiver=${cg2}`, cookie)).json() as any; // trying to look at someone else
    expect(d.rows.map((r: any) => r.name)).toEqual(["Maria Lopez"]);
    expect(d.rows[0].visits.map((v: any) => v.label)).toEqual(["Dorothy Nguyen"]);
    expect(d.open).toEqual([]);
    expect((await get("/api/overview", cookie)).status).toBe(403);
    expect((await call("POST", "/api/optimize", cookie)).status).toBe(403);
    expect((await get("/api/search?q=ja", cookie)).status).toBe(403);
  });

  it("refuses a caregiver account that is not linked to a caregiver", async () => {
    const cookie = await login(users.floater!.email);
    expect((await get("/api/schedule", cookie)).status).toBe(403);
  });

  it("keeps agencies apart even for admins", async () => {
    const cookie = await login(users.outsider!.email);
    const d = await (await get("/api/schedule?at=10:00", cookie)).json() as any;
    expect(d.rows).toEqual([]);
    const listed = await (await get("/api/admin/users", cookie)).json() as { id: string }[];
    expect(listed.map((u) => u.id)).toEqual([users.outsider!.id]);
  });
});

describe("invites", () => {
  it("is admin only", async () => {
    const cookie = await login(users.scheduler!.email);
    expect((await call("POST", "/api/admin/users", cookie, { email: "x@example.test", name: "X", role: "scheduler" })).status).toBe(403);
  });

  it("creates an account, hands over a one-time link, and the invitee sets a password", async () => {
    const admin = await login(users.admin!.email);
    const email = `invitee-${crypto_id().slice(0, 6)}@example.test`;
    const r = await call("POST", "/api/admin/users", admin, { email, name: "Ivy Invitee", role: "scheduler" });
    expect(r.status).toBe(201);
    const { link } = await r.json() as { link: string };
    expect(link.startsWith(`${APP}/?invite=`)).toBe(true);
    const token = decodeURIComponent(new URL(link).searchParams.get("invite")!);

    expect((await signIn(email, "anything-goes-here-12")).status).toBe(401); // no password yet
    expect((await post("/api/auth/reset-password", { newPassword: "short", token })).status).toBe(400);
    expect((await post("/api/auth/reset-password", { newPassword: "ivys-new-password-42", token })).status).toBe(200);
    expect((await post("/api/auth/reset-password", { newPassword: "reuse-the-link-12345", token })).status).toBeGreaterThanOrEqual(400); // single use

    const ok = await signIn(email, "ivys-new-password-42");
    expect(ok.status).toBe(200);
    const me = await (await get("/api/me", cookieOf(ok))).json() as any;
    expect(me).toMatchObject({ role: "scheduler", agencyId: A, name: "Ivy Invitee" });
    const row = (await db.select().from(s.account).where(eq(s.account.userId, me.id)))[0]!;
    expect(row.password).toMatch(/^argon2id\$/);
  });

  it("rejects duplicates, bad input and caregivers from another agency", async () => {
    const admin = await login(users.admin!.email);
    expect((await call("POST", "/api/admin/users", admin, { email: users.scheduler!.email, name: "Dup", role: "scheduler" })).status).toBe(409);
    expect((await call("POST", "/api/admin/users", admin, { email: "not-an-email", name: "X", role: "scheduler" })).status).toBe(400);
    expect((await call("POST", "/api/admin/users", admin, { email: "x1@example.test", name: "X", role: "root" })).status).toBe(400);
    expect((await call("POST", "/api/admin/users", admin, { email: "x2@example.test", name: "X", role: "caregiver" })).status).toBe(400);
    const foreign = (await db.insert(s.caregivers).values({ agencyId: B, name: await crypto.encrypt(B, "Other") }).returning())[0]!.id;
    expect((await call("POST", "/api/admin/users", admin, { email: "x3@example.test", name: "X", role: "caregiver", caregiverId: foreign })).status).toBe(400);
  });
});

describe("audit", () => {
  it("records sign-ins and invites in an intact chain", async () => {
    const rows = await db.select().from(s.auditLog).where(eq(s.auditLog.agencyId, A));
    expect(rows.some((x) => x.action === "auth.login")).toBe(true);
    expect(rows.some((x) => x.action === "user.invite")).toBe(true);
    expect(rows.some((x) => x.action === "auth.logout")).toBe(true);
    expect(await ports.audit.verify(A)).toBeNull();
    expect(await db.select().from(s.auditLog).where(and(eq(s.auditLog.agencyId, A), eq(s.auditLog.action, "auth.login"))).then((r) => r.every((x) => x.userId))).toBe(true);
  });
});
