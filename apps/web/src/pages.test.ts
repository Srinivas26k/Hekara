import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  argon2idHasher,
  createPgAudit,
  createPgRealtime,
  createPgRepository,
  envSecrets,
  fsBlob,
  intervalScheduler,
  memoryQueue,
  systemClock,
} from "@hekara/adapters-node";
import { createCrypto, generateMasterKey, masterKeyProvider } from "@hekara/crypto";
import * as s from "@hekara/db/schema";
import type { Ports } from "@hekara/ports";
import { createApp } from "./app";
import { createAuth, withClientIp } from "./auth";
import { identifyFromSession } from "./identity";

const url = process.env.DATABASE_URL ?? "postgres://hekara:hekara@localhost:5442/hekara";
const APP = "http://localhost:3000";
const PASSWORD = "a-long-test-password-1";
const sql = postgres(url, { max: 5 });
const db = drizzle(sql, { schema: s });
const hasher = argon2idHasher({ memory: 1024, passes: 1 });
const crypto = createCrypto(masterKeyProvider({ t: generateMasterKey() }, "t"));
const ports: Ports = {
  clock: systemClock,
  secrets: envSecrets,
  crypto,
  repo: createPgRepository(db, crypto),
  audit: createPgAudit(db, crypto),
  realtime: createPgRealtime(sql),
  queue: memoryQueue(),
  blob: fsBlob("./.data/test-blobs"),
  scheduler: intervalScheduler(),
};
const { auth } = createAuth({ db, hasher, audit: ports.audit, appUrl: APP, secret: "y".repeat(40) });
const app = createApp({
  ports,
  identify: identifyFromSession(auth),
  authHandler: withClientIp(auth),
  clientKey: (c) => c.req.header("x-forwarded-for") ?? "t",
  allowedOrigin: APP,
  allowTimeTravel: true,
});

let A = "",
  B = "";
const emails: Record<string, string> = {};
const cookies: Record<string, string> = {};
let ip = 0;
const midnight = new Date();
midnight.setHours(0, 0, 0, 0);
const at = (h: number) => new Date(midnight.getTime() + h * 3_600_000);
const uid = () => globalThis.crypto.randomUUID();

async function mkUser(role: string, agencyId = A) {
  const id = uid(),
    email = `${role}-${id.slice(0, 8)}@example.test`;
  await db.insert(s.user).values({ id, name: role, email, emailVerified: true, role: role as never, agencyId });
  await db
    .insert(s.account)
    .values({ id: uid(), accountId: id, providerId: "credential", userId: id, password: await hasher.hash(PASSWORD) });
  emails[role + (agencyId === B ? "-b" : "")] = email;
}
async function login(key: string) {
  const r = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    body: JSON.stringify({ email: emails[key], password: PASSWORD }),
    headers: { "content-type": "application/json", origin: APP, "x-forwarded-for": `10.1.${Math.floor(++ip / 250)}.${ip % 250}` },
  });
  expect(r.status).toBe(200);
  cookies[key] = r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}
const get = (key: string, path: string) => app.request(path, { headers: { cookie: cookies[key]! } });
const send = (key: string, path: string, body?: unknown) =>
  app.request(path, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
    headers: { cookie: cookies[key]!, origin: APP, "content-type": "application/json" },
  });

const patientIds: string[] = [];
const claimIds: Record<string, string> = {};
let otherClaim = "",
  cgId = "";

beforeAll(async () => {
  [A, B] = (await Promise.all(
    [0, 1].map(async () => (await db.insert(s.agencies).values({ name: "Pages Test Agency" }).returning())[0]!.id),
  )) as [string, string];
  for (const role of ["admin", "scheduler", "billing", "caregiver"]) await mkUser(role);
  await mkUser("admin", B);
  for (const k of ["admin", "scheduler", "billing", "caregiver", "admin-b"]) await login(k);

  for (const [i, name] of ["Alma Baker", "Bruce Collins", "Carol Dunn"].entries()) {
    const p = await ports.repo.createPatient(
      A,
      i === 1 ? { name, dob: "1941-03-02", address: "12 Elm St", notes: "uses a walker" } : { name },
    );
    patientIds.push(p.id);
    await new Promise((r) => setTimeout(r, 12));
  }
  cgId = (
    await db
      .insert(s.caregivers)
      .values({ agencyId: A, name: await crypto.encrypt(A, "Maria Lopez"), weeklyHours: 24, skills: ["HHA"] })
      .returning()
  )[0]!.id;
  const visit = async (label: string, h: number) =>
    (
      await db
        .insert(s.visits)
        .values({
          agencyId: A,
          caregiverId: cgId,
          label: await crypto.encrypt(A, label),
          startsAt: at(h),
          endsAt: at(h + 1.5),
          status: "scheduled",
        })
        .returning()
    )[0]!.id;
  const v1 = await visit("Dorothy Nguyen", 9);
  await visit("Harold K.", 14);
  const mkClaim = async (
    key: string,
    status: "draft" | "submitted" | "paid" | "denied",
    visitId: string | null = null,
    agency = A,
  ) => {
    claimIds[key] = (
      await db.insert(s.claims).values({ agencyId: agency, amountCents: 12345, status, visitId }).returning()
    )[0]!.id;
  };
  await mkClaim("draft", "draft", v1);
  await mkClaim("sub", "submitted");
  await mkClaim("paid", "paid");
  await mkClaim("denied", "denied");
  await mkClaim("draft2", "draft");
  await mkClaim("other", "draft", null, B);
  otherClaim = claimIds.other!;
});

afterAll(async () => {
  for (const id of [A, B]) {
    await db.delete(s.auditLog).where(eq(s.auditLog.agencyId, id));
    await db.delete(s.user).where(eq(s.user.agencyId, id));
    await db.delete(s.agencies).where(eq(s.agencies.id, id));
  }
  await sql.end({ timeout: 1 });
});

describe("patients", () => {
  it("lists newest first with paging, for staff only", async () => {
    const r = (await (await get("scheduler", "/api/patients?limit=2")).json()) as any;
    expect(r.total).toBe(3);
    expect(r.items.map((p: any) => p.name)).toEqual(["Carol Dunn", "Bruce Collins"]);
    const next = (await (await get("admin", "/api/patients?limit=2&offset=2")).json()) as any;
    expect(next.items.map((p: any) => p.name)).toEqual(["Alma Baker"]);
    for (const k of ["billing", "caregiver"]) expect([k, (await get(k, "/api/patients")).status]).toEqual([k, 403]);
    expect((await app.request("/api/patients")).status).toBe(401);
  });
  it("validates paging input and clamps large pages", async () => {
    expect((await get("admin", "/api/patients?limit=abc")).status).toBe(400);
    expect((await get("admin", "/api/patients?limit=1000")).status).toBe(400);
    expect((await get("admin", "/api/patients?extra=1")).status).toBe(400);
    expect(((await (await get("admin", "/api/patients?limit=999")).json()) as any).limit).toBe(100);
  });
  it("returns decrypted detail, 404 for other agencies and 400 for bad ids", async () => {
    const d = (await (await get("scheduler", `/api/patients/${patientIds[1]}`)).json()) as any;
    expect(d).toMatchObject({ name: "Bruce Collins", dob: "1941-03-02", address: "12 Elm St", notes: "uses a walker" });
    expect((await get("admin-b", `/api/patients/${patientIds[1]}`)).status).toBe(404);
    expect((await get("admin", "/api/patients/not-a-uuid")).status).toBe(400);
    expect((await get("billing", `/api/patients/${patientIds[1]}`)).status).toBe(403);
  });
  it("audits opening a record without writing the contents", async () => {
    const rows = await db
      .select()
      .from(s.auditLog)
      .where(and(eq(s.auditLog.agencyId, A), eq(s.auditLog.action, "patient.read")));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.entityId).toBe(patientIds[1]);
    expect(JSON.stringify(rows)).not.toContain("walker");
  });
});

describe("caregivers", () => {
  it("shows load and next visit to staff only", async () => {
    const list = (await (await get("scheduler", "/api/caregivers?at=10:00")).json()) as any[];
    const maria = list.find((c) => c.name === "Maria Lopez");
    expect(maria).toMatchObject({ weeklyHours: 24, weeklyLimit: 40, todayVisits: 2, todayHours: 3, skills: ["HHA"] });
    expect(maria.nextVisit.label).toBe("Harold K.");
    for (const k of ["billing", "caregiver"]) expect([k, (await get(k, "/api/caregivers")).status]).toEqual([k, 403]);
    expect((await (await get("admin-b", "/api/caregivers")).json()) as any[]).toEqual([]);
  });
});

describe("claims", () => {
  it("is limited to billing and admin", async () => {
    for (const k of ["scheduler", "caregiver"]) expect([k, (await get(k, "/api/claims")).status]).toEqual([k, 403]);
    expect((await get("billing", "/api/claims")).status).toBe(200);
    expect((await get("admin", "/api/claims")).status).toBe(200);
  });
  it("lists with counts, visit details and the allowed next steps", async () => {
    const r = (await (await get("billing", "/api/claims?status=draft")).json()) as any;
    expect(r.counts).toEqual({ draft: 2, submitted: 1, paid: 1, denied: 1 });
    expect(r.total).toBe(2);
    const withVisit = r.items.find((c: any) => c.id === claimIds.draft);
    expect(withVisit).toMatchObject({ visitLabel: "Dorothy Nguyen", amountCents: 12345, next: ["submitted"] });
    expect(r.items.find((c: any) => c.id === claimIds.draft2).visitLabel).toBeNull();
    expect((await get("billing", "/api/claims?status=bogus")).status).toBe(400);
  });
  it("walks a claim through the workflow and refuses invalid moves", async () => {
    expect((await send("billing", `/api/claims/${claimIds.draft}/status`, { status: "paid" })).status).toBe(409); // skipping a step
    expect((await send("billing", `/api/claims/${claimIds.draft}/status`, { status: "submitted" })).status).toBe(200);
    expect((await send("billing", `/api/claims/${claimIds.draft}/status`, { status: "paid" })).status).toBe(200);
    expect((await send("billing", `/api/claims/${claimIds.draft}/status`, { status: "draft" })).status).toBe(409); // paid is final
    expect((await send("admin", `/api/claims/${claimIds.denied}/status`, { status: "draft" })).status).toBe(200); // resubmit
    const r = (await (await get("billing", "/api/claims")).json()) as any;
    expect(r.counts).toEqual({ draft: 2, submitted: 1, paid: 2, denied: 0 });
  });
  it("rejects scheduler, bad input, unknown ids and other agencies' claims", async () => {
    expect((await send("scheduler", `/api/claims/${claimIds.draft2}/status`, { status: "submitted" })).status).toBe(403);
    expect((await send("billing", `/api/claims/${claimIds.draft2}/status`, { status: "nonsense" })).status).toBe(400);
    expect((await send("billing", `/api/claims/${claimIds.draft2}/status`, { status: "submitted", extra: 1 })).status).toBe(400);
    expect((await send("billing", `/api/claims/${uid()}/status`, { status: "submitted" })).status).toBe(404);
    expect((await send("billing", `/api/claims/${otherClaim}/status`, { status: "submitted" })).status).toBe(404);
    expect((await db.select().from(s.claims).where(eq(s.claims.id, otherClaim)))[0]!.status).toBe("draft");
  });
  it("audits every status change with the before and after", async () => {
    const rows = await db
      .select()
      .from(s.auditLog)
      .where(and(eq(s.auditLog.agencyId, A), eq(s.auditLog.action, "claim.status")));
    expect(rows.length).toBe(3); // three successful moves; the refused ones are not recorded as changes
    const metas = await Promise.all(rows.map(async (r) => JSON.parse(await crypto.decrypt(A, r.meta!))));
    expect(metas).toContainEqual({ from: "draft", to: "submitted" });
    expect(await ports.audit.verify(A)).toBeNull();
  });
});
