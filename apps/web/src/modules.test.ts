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
  clock: systemClock, secrets: envSecrets, crypto, repo: createPgRepository(db, crypto), audit: createPgAudit(db, crypto),
  realtime: createPgRealtime(sql), queue: memoryQueue(), blob: fsBlob("./.data/test-blobs"), scheduler: intervalScheduler(),
};
const { auth } = createAuth({ db, hasher, audit: ports.audit, appUrl: APP, secret: "z".repeat(40) });
const app = createApp({
  ports, identify: identifyFromSession(auth), authHandler: withClientIp(auth),
  clientKey: (c) => c.req.header("x-forwarded-for") ?? "t", allowedOrigin: APP, allowTimeTravel: true,
});

let A = "", B = "";
const emails: Record<string, string> = {};
const cookies: Record<string, string> = {};
let ip = 0;
const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
const at = (h: number, off = 0) => new Date(midnight.getTime() + off * 86_400_000 + h * 3_600_000);
const uid = () => globalThis.crypto.randomUUID();
const ymd = (offDays: number) => { const d = new Date(midnight.getTime() + offDays * 86_400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

async function mkUser(role: string, agencyId = A, key = role) {
  const id = uid(), email = `${role}-${id.slice(0, 8)}@example.test`;
  await db.insert(s.user).values({ id, name: role, email, emailVerified: true, role: role as never, agencyId });
  await db.insert(s.account).values({ id: uid(), accountId: id, providerId: "credential", userId: id, password: await hasher.hash(PASSWORD) });
  emails[key] = email;
}
async function login(key: string) {
  const r = await app.request("/api/auth/sign-in/email", {
    method: "POST", body: JSON.stringify({ email: emails[key], password: PASSWORD }),
    headers: { "content-type": "application/json", origin: APP, "x-forwarded-for": `10.2.${Math.floor(++ip / 250)}.${ip % 250}` },
  });
  expect(r.status).toBe(200);
  cookies[key] = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
}
const get = (key: string, path: string) => app.request(path, { headers: { cookie: cookies[key]! } });
const send = (key: string, method: string, path: string, body?: unknown) =>
  app.request(path, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { cookie: cookies[key]!, origin: APP, "content-type": "application/json" } });
const json = async (r: Response) => (await r.json()) as any;

let maria = "", james = "", patientId = "", otherPatient = "";
beforeAll(async () => {
  [A, B] = await Promise.all([0, 1].map(async () => (await db.insert(s.agencies).values({ name: "Modules Test Agency" }).returning())[0]!.id)) as [string, string];
  for (const r of ["admin", "scheduler", "billing", "caregiver"]) await mkUser(r);
  await mkUser("admin", B, "admin-b");
  for (const k of ["admin", "scheduler", "billing", "caregiver", "admin-b"]) await login(k);

  const cg = async (name: string, hours: number, i: number) => (await db.insert(s.caregivers).values({
    agencyId: A, name: await crypto.encrypt(A, name), weeklyHours: hours, weeklyLimit: 40, skills: ["HHA"], createdAt: new Date(Date.now() + i),
  }).returning())[0]!.id;
  maria = await cg("Maria Lopez", 38, 0); james = await cg("=HYPERLINK(\"http://evil\")", 10, 1); // a name that would run as a formula
  const visit = async (label: string, h: number, len: number, cgId: string | null, status: "scheduled" | "open" | "attention" = "scheduled", off = 0) =>
    db.insert(s.visits).values({ agencyId: A, caregiverId: cgId, label: await crypto.encrypt(A, label), startsAt: at(h, off), endsAt: at(h + len, off), status });
  await visit("Dorothy Nguyen", 8, 2, maria); await visit("Helen Park", 10, 2, maria); await visit("Frank R.", 15, 1, james);
  await visit("Irene Foster", 13, 1, james, "attention"); await visit("George Whitaker", 16, 2, null, "open");
  await visit("Yesterday Visit", 9, 2, maria, "scheduled", -1); await visit("Tomorrow Visit", 9, 1, james, "scheduled", 1);

  patientId = (await ports.repo.createPatient(A, { name: "Bruce Collins" })).id;
  otherPatient = (await ports.repo.createPatient(B, { name: "Other Agency Patient" })).id;
  await ports.repo.createCarePlan(A, { patientId, title: "Mobility", tasks: ["Walk daily"], reviewOn: ymd(-3) }); // overdue
  await ports.repo.addCredential(A, { caregiverId: maria, kind: "CPR", expiresOn: ymd(-5) });          // expired
  await ports.repo.addCredential(A, { caregiverId: maria, kind: "TB test", expiresOn: ymd(10) });       // due in 30 days
  await ports.repo.addCredential(A, { caregiverId: james, kind: "Background check", expiresOn: ymd(60) }); // due in 90 days
  await ports.repo.addCredential(A, { caregiverId: james, kind: "CPR", expiresOn: ymd(400) });          // valid
  await db.insert(s.claims).values([{ agencyId: A, amountCents: 10000, status: "draft" }, { agencyId: A, amountCents: 5000, status: "submitted" }, { agencyId: A, amountCents: 7000, status: "paid" }]);
});

afterAll(async () => {
  for (const id of [A, B]) {
    await db.delete(s.auditLog).where(eq(s.auditLog.agencyId, id));
    await db.delete(s.user).where(eq(s.user.agencyId, id));
    await db.delete(s.agencies).where(eq(s.agencies.id, id));
  }
  await sql.end({ timeout: 1 });
});

describe("dashboard", () => {
  it("summarises today for staff", async () => {
    const d = await json(await get("scheduler", "/api/dashboard?at=11:00"));
    expect(d.today.visits).toBe(5);
    expect(d.today.byStatus).toEqual({ done: 1, in_progress: 1, scheduled: 1, attention: 1, open: 1 });
    expect(d.today.hours).toBe(8);
    expect(d.onShift).toEqual({ count: 1, total: 2 });
    expect(d.openShifts).toBe(1);
    expect(d.overtimeRisk).toBe(1); // Maria at 38 of 40
    expect(d.attention.map((a: any) => a.label)).toEqual(["Irene Foster"]);
    expect(d.compliance).toEqual({ expired: 1, due30: 1 });
    expect(d.carePlans).toEqual({ overdue: 1 });
    expect(d.week).toHaveLength(7);
    expect(d.week.reduce((n: number, w: any) => n + w.visits, 0)).toBeGreaterThanOrEqual(5);
  });
  it("shows the claims snapshot to admins only", async () => {
    expect((await json(await get("admin", "/api/dashboard?at=11:00"))).claims).toEqual({ draft: 1, submitted: 1, outstandingCents: 15000 });
    expect((await json(await get("scheduler", "/api/dashboard?at=11:00"))).claims).toBeNull();
  });
  it("is closed to billing and caregivers, and isolated per agency", async () => {
    for (const k of ["billing", "caregiver"]) expect([k, (await get(k, "/api/dashboard")).status]).toEqual([k, 403]);
    const other = await json(await get("admin-b", "/api/dashboard?at=11:00"));
    expect(other.today.visits).toBe(0);
    expect(other.compliance).toEqual({ expired: 0, due30: 0 });
  });
});

describe("visits", () => {
  it("lists a day with caregiver names, status counts and filters", async () => {
    const r = await json(await get("scheduler", `/api/visits?date=${ymd(0)}&at=11:00`));
    expect(r.counts).toEqual({ all: 5, done: 1, in_progress: 1, scheduled: 1, attention: 1, open: 1 });
    expect(r.items.map((v: any) => v.label)).toEqual(["Dorothy Nguyen", "Helen Park", "Irene Foster", "Frank R.", "George Whitaker"]);
    expect(r.items[0]).toMatchObject({ caregiverName: "Maria Lopez", status: "done" });
    expect(r.items[4]).toMatchObject({ caregiverName: null, status: "open" });
    const open = await json(await get("admin", `/api/visits?date=${ymd(0)}&status=open&at=11:00`));
    expect(open.items.map((v: any) => v.label)).toEqual(["George Whitaker"]);
    expect(open.total).toBe(1);
  });
  it("pages, switches day and rejects bad input", async () => {
    const p = await json(await get("admin", `/api/visits?date=${ymd(0)}&limit=2&offset=2&at=11:00`));
    expect(p.items).toHaveLength(2); expect(p.total).toBe(5);
    expect((await json(await get("admin", `/api/visits?date=${ymd(-1)}`))).items.map((v: any) => v.label)).toEqual(["Yesterday Visit"]);
    for (const q of ["status=bogus", "date=tomorrow", "limit=abc", "x=1"]) expect([q, (await get("admin", `/api/visits?${q}`)).status]).toEqual([q, 400]);
    for (const k of ["billing", "caregiver"]) expect((await get(k, "/api/visits")).status).toBe(403);
    expect((await json(await get("admin-b", `/api/visits?date=${ymd(0)}`))).items).toEqual([]);
  });
});

describe("care plans", () => {
  let planId = "";
  it("creates, reads, lists and updates plans for staff", async () => {
    const created = await send("scheduler", "POST", "/api/care-plans", { patientId, title: "Recovery routine", instructions: "Call the nurse if dizzy.", tasks: ["Meal prep", "Medication reminder"], reviewOn: ymd(5) });
    expect(created.status).toBe(201);
    const plan = await json(created); planId = plan.id;
    expect(plan).toMatchObject({ patientName: "Bruce Collins", title: "Recovery routine", status: "active", taskCount: 2, review: "due7", instructions: "Call the nurse if dizzy." });
    expect((await json(await get("admin", `/api/care-plans/${planId}`))).tasks).toEqual(["Meal prep", "Medication reminder"]);
    const list = await json(await get("scheduler", "/api/care-plans"));
    expect(list.total).toBe(2);
    expect(list.items.find((p: any) => p.title === "Mobility").review).toBe("overdue");
    expect((await json(await get("admin", "/api/care-plans?status=paused"))).total).toBe(0);
    const patched = await json(await send("scheduler", "PATCH", `/api/care-plans/${planId}`, { status: "paused", reviewOn: null, tasks: [] }));
    expect(patched).toMatchObject({ status: "paused", reviewOn: null, review: "none", taskCount: 0 });
    expect((await json(await get("admin", "/api/care-plans?status=paused"))).total).toBe(1);
  });
  it("validates input and hides other agencies' data", async () => {
    const bad: [string, unknown][] = [
      ["unknown field", { patientId, title: "x", extra: 1 }], ["empty title", { patientId, title: " " }],
      ["bad date", { patientId, title: "x", reviewOn: "soon" }], ["bad status", { patientId, title: "x", status: "done" }],
      ["too many tasks", { patientId, title: "x", tasks: Array.from({ length: 31 }, (_, i) => `t${i}`) }], ["bad patient id", { patientId: "nope", title: "x" }],
    ];
    for (const [name, body] of bad) expect([name, (await send("admin", "POST", "/api/care-plans", body)).status]).toEqual([name, 400]);
    expect((await send("admin", "POST", "/api/care-plans", { patientId: otherPatient, title: "x" })).status).toBe(404); // another agency's patient
    expect((await get("admin-b", `/api/care-plans/${planId}`)).status).toBe(404);
    expect((await send("admin-b", "PATCH", `/api/care-plans/${planId}`, { title: "Hijack" })).status).toBe(404);
    expect((await json(await get("admin-b", "/api/care-plans"))).total).toBe(0);
    expect((await json(await get("admin", `/api/care-plans/${planId}`))).title).toBe("Recovery routine");
  });
  it("is closed to billing and caregivers, and audited without contents", async () => {
    for (const k of ["billing", "caregiver"]) {
      expect([k, (await get(k, "/api/care-plans")).status]).toEqual([k, 403]);
      expect([k, (await send(k, "POST", "/api/care-plans", { patientId, title: "x" })).status]).toEqual([k, 403]);
    }
    const rows = await db.select().from(s.auditLog).where(and(eq(s.auditLog.agencyId, A), eq(s.auditLog.entity, "careplan")));
    expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining(["careplan.create", "careplan.update", "careplan.read"]));
    expect(JSON.stringify(rows)).not.toMatch(/dizzy|Meal prep/);
  });
});

describe("compliance", () => {
  it("classifies credentials and counts them", async () => {
    const r = await json(await get("scheduler", "/api/compliance"));
    expect(r.counts).toEqual({ expired: 1, due30: 1, due90: 1, valid: 1 });
    expect(r.items.map((c: any) => [c.kind, c.status])).toEqual([["CPR", "expired"], ["TB test", "due30"], ["Background check", "due90"], ["CPR", "valid"]]);
    expect(r.items[0]).toMatchObject({ caregiverName: "Maria Lopez", daysLeft: -5 });
    expect(r.caregivers.map((c: any) => c.id).sort()).toEqual([maria, james].sort());
    for (const k of ["billing", "caregiver"]) expect((await get(k, "/api/compliance")).status).toBe(403);
    expect((await json(await get("admin-b", "/api/compliance"))).items).toEqual([]);
  });
  it("adds credentials, rejecting bad dates and foreign caregivers", async () => {
    const ok = await send("scheduler", "POST", "/api/compliance/credentials", { caregiverId: james, kind: "Flu shot", issuedOn: ymd(-10), expiresOn: ymd(20) });
    expect(ok.status).toBe(201);
    expect(await json(ok)).toMatchObject({ kind: "Flu shot", status: "due30", caregiverName: james ? expect.any(String) : "" });
    expect((await send("scheduler", "POST", "/api/compliance/credentials", { caregiverId: james, kind: "X", issuedOn: ymd(5), expiresOn: ymd(1) })).status).toBe(400);
    expect((await send("scheduler", "POST", "/api/compliance/credentials", { caregiverId: james, kind: "X", expiresOn: "01/02/2027" })).status).toBe(400);
    const foreign = (await db.insert(s.caregivers).values({ agencyId: B, name: await crypto.encrypt(B, "Other") }).returning())[0]!.id;
    expect((await send("scheduler", "POST", "/api/compliance/credentials", { caregiverId: foreign, kind: "CPR", expiresOn: ymd(100) })).status).toBe(404);
    expect((await send("billing", "POST", "/api/compliance/credentials", { caregiverId: james, kind: "CPR", expiresOn: ymd(100) })).status).toBe(403);
  });
  it("lets only admins delete, and only inside their agency", async () => {
    const list = await json(await get("admin", "/api/compliance"));
    const target = list.items.find((c: any) => c.kind === "Flu shot").id;
    expect((await send("scheduler", "DELETE", `/api/compliance/credentials/${target}`)).status).toBe(403);
    expect((await send("admin-b", "DELETE", `/api/compliance/credentials/${target}`)).status).toBe(404);
    expect((await send("admin", "DELETE", `/api/compliance/credentials/${target}`)).status).toBe(204);
    expect((await send("admin", "DELETE", `/api/compliance/credentials/${target}`)).status).toBe(404);
  });
});

describe("reports", () => {
  it("gives admins hours, fill rate, daily totals and claims", async () => {
    const r = await json(await get("admin", "/api/reports?days=7&at=11:00"));
    expect(r.days).toBe(7); expect(r.perDay).toHaveLength(7);
    const todayRow = r.perDay.find((d: any) => d.date === ymd(0));
    expect(todayRow).toEqual({ date: ymd(0), visits: 5, hours: 8 });
    expect(r.fill).toEqual({ total: 6, filled: 5, open: 1, rate: 83.3 }); // the tomorrow visit is outside the window
    expect(r.hours[0]).toMatchObject({ name: "Maria Lopez", visits: 3, scheduledHours: 6, overtimeRisk: true });
    expect(r.claims.counts).toEqual({ draft: 1, submitted: 1, paid: 1, denied: 0 });
    expect(r.claims.amountCents.paid).toBe(7000);
  });
  it("limits each role to its own sections", async () => {
    const sch = await json(await get("scheduler", "/api/reports?at=11:00"));
    expect(sch.claims).toBeNull(); expect(sch.hours).not.toBeNull();
    const bill = await json(await get("billing", "/api/reports"));
    expect(bill).toMatchObject({ hours: null, fill: null, perDay: null }); expect(bill.claims.counts.draft).toBe(1);
    expect((await get("caregiver", "/api/reports")).status).toBe(403);
    for (const q of ["days=3", "days=abc", "x=1"]) expect([q, (await get("admin", `/api/reports?${q}`)).status]).toEqual([q, 400]);
    expect((await json(await get("admin-b", "/api/reports"))).fill.total).toBe(0);
  });
  it("exports CSV for staff, neutralising spreadsheet formulas, and audits it", async () => {
    const r = await get("scheduler", "/api/reports/hours.csv?at=11:00");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/csv");
    expect(r.headers.get("content-disposition")).toContain("attachment");
    const text = await r.text();
    expect(text.split("\r\n")[0]).toBe("Caregiver,Visits,Scheduled hours,Weekly hours so far,Weekly limit,Overtime risk");
    expect(text).toContain("Maria Lopez,3,6,38,40,yes");
    expect(text).not.toMatch(/^=HYPERLINK/m); // defused: the cell now starts with a quote
    expect(text).toContain(`"'=HYPERLINK(""http://evil"")"`);
    for (const k of ["billing", "caregiver"]) expect((await get(k, "/api/reports/hours.csv")).status).toBe(403);
    expect((await db.select().from(s.auditLog).where(and(eq(s.auditLog.agencyId, A), eq(s.auditLog.action, "report.export")))).length).toBe(1);
  });
});

describe("settings", () => {
  it("lets admins read and rename the agency, and shows the security policy", async () => {
    expect(await json(await get("admin", "/api/settings"))).toEqual({ agencyName: "Modules Test Agency", sessionIdleMinutes: 30, sessionMaxHours: 12, passwordMinLength: 12 });
    const r = await json(await send("admin", "PUT", "/api/settings", { agencyName: "Renamed Agency" }));
    expect(r.agencyName).toBe("Renamed Agency");
    expect((await json(await get("scheduler", "/api/me"))).agencyName).toBe("Renamed Agency");
    expect((await json(await get("admin-b", "/api/settings"))).agencyName).toBe("Modules Test Agency"); // the other agency is untouched
  });
  it("rejects non-admins and bad input", async () => {
    for (const k of ["scheduler", "billing", "caregiver"]) {
      expect([k, (await get(k, "/api/settings")).status]).toEqual([k, 403]);
      expect([k, (await send(k, "PUT", "/api/settings", { agencyName: "x" })).status]).toEqual([k, 403]);
    }
    expect((await send("admin", "PUT", "/api/settings", { agencyName: "  " })).status).toBe(400);
    expect((await send("admin", "PUT", "/api/settings", { agencyName: "ok", extra: 1 })).status).toBe(400);
    expect(await ports.audit.verify(A)).toBeNull();
  });
});
