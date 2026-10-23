import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createCrypto } from "@hekara/crypto";
import * as s from "@hekara/db/schema";
import { loadConfig } from "./config";

/**
 * Demo agency matching the design reference: 62 caregivers, 142 visits today, 14 draft claims, 10 new patients.
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
  const cgRows = await db.insert(s.caregivers).values(await Promise.all(people.map(async (p) => ({
    agencyId: A, name: await enc(p.name), nameIdx: await idx(p.name), weeklyHours: p.hours, weeklyLimit: 40,
    skills: p.skills, flagged: p.flagged,
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
  const cursor = new Map(extra.map((p) => [p.name, 7 + Math.floor(rand() * 6) / 2]));
  for (let round = 0; visits.length < TARGET && round < 12; round++) {
    for (const p of extra) {
      if (visits.length >= TARGET) break;
      const start = cursor.get(p.name)!;
      const dur = pick([1, 1.5, 2]);
      if (start + dur > 19) continue;
      visits.push({ caregiver: p.name, label: pick(patientNames), start, end: start + dur, status: "scheduled", req: p.skills.includes("HHA") && rand() < 0.3 ? "HHA" : null });
      cursor.set(p.name, start + dur + pick([0.5, 1, 1.5]));
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

  // Claims: 14 drafts (shown as the sidebar badge) plus history
  const statuses = [...Array(14).fill("draft"), ...Array(20).fill("submitted"), ...Array(40).fill("paid"), ...Array(6).fill("denied")] as const;
  await db.insert(s.claims).values(statuses.map((status, i) => ({
    agencyId: A, visitId: visitRows[i % visitRows.length]!.id, amountCents: 4500 + Math.floor(rand() * 13500), status,
    createdAt: ago(i % 20),
  })));

  console.log(`Seeded ${NAME}: agency ${A}`);
  console.log(`  ${people.length} caregivers, ${visitRows.length} visits, ${patRows.length} patients, ${statuses.length} claims`);
}

try { await main(); } finally { await sql.end({ timeout: 2 }); }
