import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { randomBytes } from "node:crypto";
import { argon2idHasher } from "@hekara/adapters-node";
import { createCrypto } from "@hekara/crypto";
import * as s from "@hekara/db/schema";
import { loadConfig } from "./config";

/**
 * Demo agency and one user per role, matching the design reference: 62 caregivers, 142 visits today, 14 draft claims, 10 new patients.
 * Deterministic. Use --reset to rebuild. Never run against production.
 */
const NAME = "Juniper Home Health";
const cfg = loadConfig();
const sql = postgres(cfg.databaseUrl, { max: 4 });
const db = drizzle(sql, { schema: s });
const crypto = createCrypto(cfg.keys);

let seedState = 20260930;
const rand = () => { // mulberry32
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rand() * a.length)]!;
const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");

type Kind = "sched" | "attn";
const FEATURED: { name: string; flagged?: boolean; hours: number; shifts: [string, number, number, Kind?][] }[] = [
  { name: "Maria Lopez", hours: 24, shifts: [["Sarah Mitchell", 8, 10], ["Dorothy Nguyen", 11, 13], ["Harold K.", 14, 15]] },
  { name: "James Carter", flagged: true, hours: 36, shifts: [["Walter S.", 8.5, 9.5], ["Helen Park", 10.5, 12], ["Frank R.", 15, 16]] },
  { name: "Aisha Bello", hours: 28, shifts: [["M. O'Neil", 7.5, 8.5], ["Joseph Ramirez", 9.5, 11.5], ["Ruth C.", 13, 14], ["Nora C.", 16, 17]] },
  { name: "Devon Price", hours: 22, shifts: [["Thomas Reed", 9, 11], ["Betty Anderson", 12, 14]] },
  { name: "Carlos Mendes", hours: 30, shifts: [["Linda Alvarez", 8, 10], ["Charles Wu", 11, 13], ["Irene Foster", 13, 15, "attn"]] },
  { name: "Priya Raman", hours: 18, shifts: [["Evelyn S.", 10, 11], ["Walter S.", 13.5, 14.5]] },
  { name: "Rosa Delgado", flagged: true, hours: 38, shifts: [["George Whitaker", 7, 10], ["Joan Pierce", 11, 14]] },
  { name: "Tanya Brooks", hours: 16, shifts: [["Clara Jensen", 13, 15]] },
  { name: "Elena Ruiz", hours: 20, shifts: [["Paul J.", 8, 9], ["Linda A.", 12, 13], ["Arthur B.", 16, 17]] },
];
const OPEN: [string, number, number, string][] = [["George Whitaker", 16, 18, "HHA"], ["Nancy Flores", 18, 19, "Companion"]];

const FIRST = ["Amara", "Ben", "Chloe", "Dmitri", "Esther", "Farid", "Grace", "Hugo", "Imani", "Jonas", "Keiko", "Luis", "Mina", "Noah", "Olga", "Pablo", "Quinn", "Rhea", "Sofia", "Tariq", "Uma", "Victor", "Wanda", "Ximena", "Yusuf", "Zara"];
const LAST = ["Adams", "Bianchi", "Cho", "Dawson", "Ellis", "Fofana", "Gupta", "Haddad", "Ito", "Jensen", "Kowalski", "Lindqvist", "Mbeki", "Novak", "Okafor", "Petrov", "Quispe", "Reyes", "Singh", "Tanaka"];
const PATIENT_FIRST = ["Alma", "Bruce", "Carol", "Dennis", "Edith", "Floyd", "Gladys", "Howard", "Iris", "Jack", "Kathy", "Leon", "Mabel", "Norman", "Opal", "Perry"];
const PATIENT_LAST = ["Baker", "Collins", "Dunn", "Evans", "Fisher", "Grant", "Hayes", "Irwin", "Jordan", "Keller", "Lowe", "Moss"];

const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
const at = (h: number) => new Date(midnight.getTime() + h * 3_600_000);
const ago = (days: number) => new Date(Date.now() - days * 86_400_000);

async function main() {
  const [existing] = await db.select().from(s.agencies).where(eq(s.agencies.name, NAME));
  if (existing) {
    if (!process.argv.includes("--reset")) { console.log(`${NAME} already exists (${existing.id}). Use --reset to rebuild.`); return; }
    await db.delete(s.user).where(eq(s.user.agencyId, existing.id)); // cascades to sessions, accounts, passkeys
    await db.delete(s.auditLog).where(eq(s.auditLog.agencyId, existing.id));
    await db.delete(s.agencies).where(eq(s.agencies.id, existing.id));
  }
  const [agency] = await db.insert(s.agencies).values({ name: NAME }).returning();
  const A = agency!.id;
  const enc = (v: string) => crypto.encrypt(A, v);
  const idx = (v: string) => crypto.blindIndex(A, norm(v));

  // Caregivers: 9 featured + 53 generated = 62
  const generated = Array.from({ length: 53 }, (_, i) => `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`);
  const people = [
    ...FEATURED.map((f) => ({ name: f.name, hours: f.hours, flagged: !!f.flagged, skills: ["HHA", "Companion"] })),
    ...generated.map((name) => ({ name, hours: 10 + Math.floor(rand() * 24), flagged: false, skills: rand() < 0.75 ? ["HHA", "Companion"] : ["Companion"] })),
  ];
  const cgRows = await db.insert(s.caregivers).values(await Promise.all(people.map(async (p, i) => ({
    agencyId: A, name: await enc(p.name), nameIdx: await idx(p.name), weeklyHours: p.hours, weeklyLimit: 40,
    skills: p.skills, flagged: p.flagged, createdAt: new Date(midnight.getTime() - 86_400_000 * 90 + i * 1000),
  })))).returning();
  const cgId = new Map(people.map((p, i) => [p.name, cgRows[i]!.id]));

  // Visits: featured (23) + open (2) + generated to reach 142
  type V = { caregiver: string | null; label: string; start: number; end: number; status: "scheduled" | "attention" | "open"; req: string | null };
  const visits: V[] = [];
  for (const f of FEATURED) for (const [label, start, end, kind] of f.shifts)
    visits.push({ caregiver: f.name, label, start, end, status: kind === "attn" ? "attention" : "scheduled", req: null });
  for (const [label, start, end, req] of OPEN) visits.push({ caregiver: null, label, start, end, status: "open", req });

  const patientPool = new Set<string>(visits.map((v) => v.label));
  while (patientPool.size < 64) patientPool.add(`${pick(PATIENT_FIRST)} ${pick(PATIENT_LAST)}`);
  const patientNames = [...patientPool];
  const TARGET = 142;
  const extra = people.slice(FEATURED.length);
  const cursor = new Map(extra.map((p) => [p.name, 7 + Math.floor(rand() * 12) / 2]));
  for (let round = 0; visits.length < TARGET && round < 12; round++) {
    for (const p of extra) {
      if (visits.length >= TARGET) break;
      const start = cursor.get(p.name)!;
      const dur = pick([1, 1.5, 2]);
      if (start + dur > 19) continue;
      visits.push({ caregiver: p.name, label: pick(patientNames), start, end: start + dur, status: "scheduled", req: p.skills.includes("HHA") && rand() < 0.3 ? "HHA" : null });
      cursor.set(p.name, start + dur + pick([1, 1.5, 2, 2.5]));
    }
  }
  if (visits.length < TARGET) throw new Error(`Could only place ${visits.length} visits`);

  // Patients: 10 created in the last week, the rest older
  const patRows = await db.insert(s.patients).values(await Promise.all(patientNames.map(async (name, i) => ({
    agencyId: A, name: await enc(name), nameIdx: await idx(name),
    createdAt: i < 10 ? ago(i * 0.7 + 0.2) : ago(30 + i * 3),
  })))).returning();
  const patId = new Map(patientNames.map((n, i) => [n, patRows[i]!.id]));

  const visitRows = await db.insert(s.visits).values(await Promise.all(visits.map(async (v) => ({
    agencyId: A, caregiverId: v.caregiver ? cgId.get(v.caregiver)! : null, patientId: patId.get(v.label) ?? null,
    label: await enc(v.label), startsAt: at(v.start), endsAt: at(v.end), status: v.status, requirement: v.req,
  })))).returning();

  // The surrounding week: 6 days of history and 3 days ahead, so Week view and Reports have something to show.
  const atDay = (off: number, h: number) => new Date(midnight.getTime() + off * 86_400_000 + h * 3_600_000);
  for (const off of [-6, -5, -4, -3, -2, -1, 1, 2, 3]) {
    const day: V[] = [];
    const cur = new Map(extra.map((p) => [p.name, 7 + Math.floor(rand() * 12) / 2]));
    for (let round = 0; day.length < 110 && round < 10; round++) for (const p of extra) {
      if (day.length >= 110) break;
      const start = cur.get(p.name)!, dur = pick([1, 1.5, 2]);
      if (start + dur > 19) continue;
      day.push({ caregiver: p.name, label: pick(patientNames), start, end: start + dur, status: "scheduled", req: p.skills.includes("HHA") && rand() < 0.3 ? "HHA" : null });
      cur.set(p.name, start + dur + pick([1, 1.5, 2, 2.5]));
    }
    if (off > 0) for (const [label, st, en, req] of [["Dorothy Nguyen", 9, 11, "HHA"], ["Harold K.", 14, 16, "Companion"]] as const) {
      if (rand() < 0.7) day.push({ caregiver: null, label, start: st, end: en, status: "open", req });
    }
    await db.insert(s.visits).values(await Promise.all(day.map(async (v) => ({
      agencyId: A, caregiverId: v.caregiver ? cgId.get(v.caregiver)! : null, patientId: patId.get(v.label) ?? null,
      label: await enc(v.label), startsAt: atDay(off, v.start), endsAt: atDay(off, v.end), status: v.status, requirement: v.req,
    }))));
  }

  // Care plans for about two thirds of patients
  const GOALS = ["Medication reminders", "Mobility and fall prevention", "Meal preparation", "Personal care and bathing", "Companionship and activity", "Wound care follow-up", "Light housekeeping", "Transportation to appointments"];
  const PLAN_TITLES = ["Daily living support", "Post-hospital recovery", "Mobility and safety", "Chronic condition care", "Memory care routine"];
  const reviewIn = (days: number) => new Date(midnight.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  const planRows = [];
  for (const [i, name] of patientNames.entries()) {
    if (i % 3 === 2) continue;
    const tasks = Array.from(new Set(Array.from({ length: 3 + Math.floor(rand() * 3) }, () => pick(GOALS))));
    planRows.push({
      agencyId: A, patientId: patId.get(name)!, title: await enc(pick(PLAN_TITLES)),
      instructions: await enc("Follow the agreed routine. Report any change in condition to the supervising nurse the same day."),
      tasks: await enc(JSON.stringify(tasks)),
      status: (i % 11 === 0 ? "paused" : i % 13 === 0 ? "completed" : "active") as "active" | "paused" | "completed",
      reviewOn: reviewIn(Math.floor(rand() * 120) - 20), // some already overdue
    });
  }
  await db.insert(s.carePlans).values(planRows);

  // Credentials: each caregiver holds 3 or 4; expiry dates span expired, soon, and comfortably valid
  const KINDS = ["CPR / First Aid", "TB test", "Background check", "HHA certification", "Driver's licence"];
  const credRows = [];
  for (const p of people) for (const kind of KINDS.slice(0, 3 + (rand() < 0.5 ? 1 : 0))) {
    const roll = rand();
    const days = roll < 0.06 ? -Math.floor(rand() * 60) - 1 : roll < 0.2 ? Math.floor(rand() * 30) : roll < 0.4 ? 30 + Math.floor(rand() * 60) : 90 + Math.floor(rand() * 600);
    credRows.push({ agencyId: A, caregiverId: cgId.get(p.name)!, kind, issuedOn: reviewIn(days - 365), expiresOn: reviewIn(days) });
  }
  await db.insert(s.credentials).values(credRows);

  // Claims: 14 drafts (shown as the sidebar badge) plus history
  const statuses = [...Array(14).fill("draft"), ...Array(20).fill("submitted"), ...Array(40).fill("paid"), ...Array(6).fill("denied")] as const;
  await db.insert(s.claims).values(statuses.map((status, i) => ({
    agencyId: A, visitId: visitRows[i % visitRows.length]!.id, amountCents: 4500 + Math.floor(rand() * 13500), status,
    createdAt: ago(i % 20),
  })));

  // Demo accounts, one per role. The password comes from DEMO_PASSWORD or is generated and printed once.
  const password = process.env.DEMO_PASSWORD ?? randomBytes(15).toString("base64url");
  const hash = await argon2idHasher().hash(password);
  const demo = [
    { name: "Dana Admin", email: "admin@juniper.test", role: "admin" as const, caregiverId: null },
    { name: "Sam Scheduler", email: "scheduler@juniper.test", role: "scheduler" as const, caregiverId: null },
    { name: "Maria Lopez", email: "caregiver@juniper.test", role: "caregiver" as const, caregiverId: cgId.get("Maria Lopez")! },
    { name: "Bea Billing", email: "billing@juniper.test", role: "billing" as const, caregiverId: null },
  ];
  for (const u of demo) {
    const id = globalThis.crypto.randomUUID();
    await db.insert(s.user).values({ id, name: u.name, email: u.email, emailVerified: true, role: u.role, agencyId: A, caregiverId: u.caregiverId });
    await db.insert(s.account).values({ id: globalThis.crypto.randomUUID(), accountId: id, providerId: "credential", userId: id, password: hash });
  }

  console.log(`Seeded ${NAME}: agency ${A}`);
  console.log(`  demo sign-ins (${password}):`);
  for (const u of demo) console.log(`    ${u.role.padEnd(10)} ${u.email}`);
  console.log(`  ${people.length} caregivers, ${visitRows.length} visits today (plus a week around it), ${patRows.length} patients, ${planRows.length} care plans, ${credRows.length} credentials, ${statuses.length} claims`);
}

try { await main(); } finally { await sql.end({ timeout: 2 }); }
