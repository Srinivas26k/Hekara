import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPgAudit, createPgRealtime, createPgRepository, fsBlob, intervalScheduler, memoryQueue, envSecrets, systemClock } from "@hekara/adapters-node";
import { createCrypto, generateMasterKey, masterKeyProvider } from "@hekara/crypto";
import * as s from "@hekara/db/schema";
import type { Ports } from "@hekara/ports";
import { createApp, type Identity } from "./app";
import { HttpError } from "./errors";

const url = process.env.DATABASE_URL ?? "postgres://hekara:hekara@localhost:5442/hekara";
const ORIGIN = "http://localhost:3000";
const sql = postgres(url, { max: 5 });
const db = drizzle(sql, { schema: s });
const crypto = createCrypto(masterKeyProvider({ t: generateMasterKey() }, "t"));
const ports: Ports = {
  clock: systemClock, secrets: envSecrets, crypto, repo: createPgRepository(db, crypto), audit: createPgAudit(db, crypto),
  realtime: createPgRealtime(sql), queue: memoryQueue(), blob: fsBlob("./.data/test-blobs"), scheduler: intervalScheduler(),
};

const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
const at = (h: number) => new Date(midnight.getTime() + h * 3_600_000);

let A = "", B = "";
let me = "";
const ids: Record<string, string> = {};
const who = (agencyId: string, role: Identity["role"] = "admin", caregiverId: string | null = null): Identity =>
  ({ agencyId, userId: "tester", role, caregiverId, name: "Tester", email: "t@example.test", twoFactorEnabled: false });
const appFor = (agency: () => string) => createApp({
  ports, identify: async () => who(agency()), clientKey: () => "test",
  allowedOrigin: ORIGIN, allowTimeTravel: true,
});
const app = appFor(() => me);

const post = (path: string, body?: unknown, origin: string | null = ORIGIN) =>
  app.request(`/api${path}${path.includes("?") ? "&" : "?"}at=10:00`, { // pinned clock keeps the suggestions deterministic
    method: "POST", body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json", ...(origin ? { origin } : {}) },
  });
const get = (path: string) => app.request(`/api${path}`);

async function mkAgency(name: string) {
  const [a] = await db.insert(s.agencies).values({ name }).returning();
  return a!.id;
}
async function mkCaregiver(agency: string, name: string, hours: number, skills = ["HHA", "Companion"], i = 0) {
  const [r] = await db.insert(s.caregivers).values({
    agencyId: agency, name: await crypto.encrypt(agency, name), weeklyHours: hours, weeklyLimit: 40, skills,
    createdAt: new Date(Date.now() + i),
  }).returning();
  return r!.id;
}
async function mkVisit(agency: string, label: string, start: number, end: number, caregiverId: string | null, status: "scheduled" | "open" | "attention" = "scheduled", requirement: string | null = null) {
  const [r] = await db.insert(s.visits).values({
    agencyId: agency, caregiverId, label: await crypto.encrypt(agency, label), startsAt: at(start), endsAt: at(end), status, requirement,
  }).returning();
  return r!.id;
}

beforeAll(async () => {
  A = await mkAgency("App Test Agency"); B = await mkAgency("App Test Agency"); me = A;
  ids.rosa = await mkCaregiver(A, "Rosa Delgado", 38, ["HHA", "Companion"], 0);
  ids.aisha = await mkCaregiver(A, "Aisha Bello", 10, ["HHA", "Companion"], 1);
  ids.tanya = await mkCaregiver(A, "Tanya Brooks", 16, ["Companion"], 2);
  ids.joan = await mkVisit(A, "Joan Pierce", 11, 14, ids.rosa!);
  ids.irene = await mkVisit(A, "Irene Foster", 13, 15, ids.tanya!, "attention");
  ids.george = await mkVisit(A, "George Whitaker", 16, 18, null, "open", "HHA");
  ids.nancy = await mkVisit(A, "Nancy Flores", 18, 19, null, "open", "Companion");
  await db.insert(s.patients).values({ agencyId: A, name: await crypto.encrypt(A, "Old Patient"), createdAt: new Date(Date.now() - 30 * 86_400_000) });
  await db.insert(s.claims).values([{ agencyId: A, amountCents: 100, status: "draft" }, { agencyId: A, amountCents: 100, status: "paid" }]);
});

afterAll(async () => {
  for (const id of [A, B]) {
    await db.delete(s.auditLog).where(eq(s.auditLog.agencyId, id));
    await db.delete(s.agencies).where(eq(s.agencies.id, id));
  }
  await sql.end({ timeout: 1 });
});

describe("security", () => {
  it("sets strict headers", async () => {
    const r = await app.request("/healthz");
    expect(r.headers.get("content-security-policy")).toContain("default-src 'self'");
    expect(r.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect(r.headers.get("content-security-policy")).not.toContain("unsafe-inline");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("strict-transport-security")).toContain("preload");
  });
  it("rejects state changes from another origin or with no origin", async () => {
    expect((await post("/optimize", undefined, "https://evil.example")).status).toBe(403);
    expect((await post("/optimize", undefined, null)).status).toBe(403);
  });
  it("marks API responses uncacheable", async () => {
    expect((await get("/overview?at=10:00")).headers.get("cache-control")).toBe("no-store");
  });
  it("returns generic errors for invalid input, including unknown fields", async () => {
    const r = await post("/patients", { name: "X", isAdmin: true });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: { code: "invalid_request", message: "Invalid request" } });
    expect((await post("/patients", { name: "" })).status).toBe(400);
    expect((await get("/search?q=a")).status).toBe(400);
    expect((await post("/visits/not-a-uuid/fill", {})).status).toBe(400);
  });
  it("ignores time travel when disabled", async () => {
    const strict = createApp({ ports, identify: async () => who(A), clientKey: () => "t", allowedOrigin: ORIGIN });
    const body = await (await strict.request("/api/overview?at=10:00")).json() as { now: string };
    expect(Math.abs(new Date(body.now).getTime() - Date.now())).toBeLessThan(5000);
  });
});

describe("overview", () => {
  it("computes badges, open shifts, overtime and live on-shift from the data", async () => {
    const o = await (await get("/overview?at=12:00")).json() as any;
    expect(o.visitCount).toBe(4);
    expect(o.badges).toEqual({ patients: 0, schedule: 3, claims: 1 });
    expect(o.openShifts.map((x: any) => x.label)).toEqual(["George Whitaker", "Nancy Flores"]);
    expect(o.overtime.map((x: any) => x.name)).toEqual(["Rosa Delgado"]);
    expect(o.onShift.count).toBe(1); // Rosa's visit runs 11 to 14
    expect(o.onShift.total).toBe(3);
  });
  it("suggests filling George with the least-loaded eligible caregiver", async () => {
    const o = await (await get("/overview?at=10:00")).json() as any;
    const fill = o.suggestions.items.find((x: any) => x.label === "George Whitaker");
    expect(fill).toMatchObject({ kind: "fill", caregiverName: "Aisha Bello" });
    expect(o.suggestions.items.some((x: any) => x.kind === "move" && x.fromCaregiverName === "Rosa Delgado")).toBe(true);
  });
});

describe("schedule", () => {
  it("derives statuses from the clock", async () => {
    const d = await (await get("/schedule?at=12:00")).json() as any;
    const rosa = d.rows.find((r: any) => r.name === "Rosa Delgado");
    expect(rosa.visits[0].status).toBe("in_progress");
    const early = await (await get("/schedule?at=09:00")).json() as any;
    expect(early.rows.find((r: any) => r.name === "Rosa Delgado").visits[0].status).toBe("scheduled");
    const late = await (await get("/schedule?at=15:30")).json() as any;
    expect(late.rows.find((r: any) => r.name === "Rosa Delgado").visits[0].status).toBe("done");
    expect(d.rows.find((r: any) => r.name === "Tanya Brooks").visits[0].status).toBe("attention");
    expect(d.open.length).toBe(2);
  });
  it("returns a week view with per-day hours", async () => {
    const w = await (await get("/schedule?view=week")).json() as any;
    expect(w.days).toHaveLength(7);
    const rosa = w.rows.find((r: any) => r.name === "Rosa Delgado");
    expect(rosa.days.reduce((n: number, d: any) => n + d.hours, 0)).toBe(3);
  });
});

describe("agency isolation", () => {
  it("does not let another agency read or fill our shifts", async () => {
    me = B;
    try {
      expect((await post(`/visits/${ids.george}/fill`, {})).status).toBe(404);
      const d = await (await get("/schedule")).json() as any;
      expect(d.rows).toEqual([]);
      expect((await get("/search?q=Rosa")).status).toBe(200);
      expect(await (await get("/search?q=Rosa")).json()).toEqual([]);
    } finally { me = A; }
  });
});

describe("fill and suggestions", () => {
  it("rejects a caregiver who lacks the skill", async () => {
    const r = await post(`/visits/${ids.george}/fill`, { caregiverId: ids.tanya });
    expect(r.status).toBe(422);
  });
  it("fills the open shift with the best caregiver, then refuses a second fill", async () => {
    const r = await post(`/visits/${ids.george}/fill`, {});
    expect(r.status).toBe(200);
    const body = await r.json() as any;
    expect(body.caregiver.name).toBe("Aisha Bello");
    expect(body.visit.status).not.toBe("open");
    expect((await post(`/visits/${ids.george}/fill`, {})).status).toBe(409);
  });
  it("can undo a fill", async () => {
    const r = await post(`/visits/${ids.george}/unfill`);
    expect(((await r.json()) as any).status).toBe("open");
  });
  it("applies only fresh suggestions and rejects stale ids", async () => {
    expect((await post("/suggestions/apply", { visitIds: ["11111111-1111-4111-8111-111111111111"] })).status).toBe(409);
    const r = await post("/suggestions/apply", { visitIds: [ids.george!] });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ applied: 1 });
  });
});

describe("patients, search and audit", () => {
  it("creates an encrypted patient that search can find", async () => {
    const r = await post("/patients", { name: "Zelda Quimby", notes: "allergic to latex" });
    expect(r.status).toBe(201);
    const { id } = await r.json() as any;
    const [row] = await db.select().from(s.patients).where(eq(s.patients.id, id));
    expect(row!.name).toMatch(/^v1\./);
    expect(row!.notes).toMatch(/^v1\./);
    const hits = await (await get("/search?q=quimby")).json() as any[];
    expect(hits.map((h) => h.title)).toEqual(["Zelda Quimby"]);
  });
  it("keeps the audit chain intact and never stores plaintext meta", async () => {
    expect(await ports.audit.verify(A)).toBeNull();
    const rows = await db.select().from(s.auditLog).where(eq(s.auditLog.agencyId, A));
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.every((x) => x.meta === null || x.meta.startsWith("v1."))).toBe(true);
    expect(rows.some((x) => x.action === "visit.fill")).toBe(true);
  });
});
