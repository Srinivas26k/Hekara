import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as Schema from "@hekara/db/schema";
import { caregivers, claims, patients, visits } from "@hekara/db/schema";
import type { Caregiver, Id, StoredStatus, Visit } from "@hekara/core";
import type { ClaimRow, Crypto, Patient, PatientInput, Repository, SearchHit, VisitQuery } from "@hekara/ports";

type Db = PostgresJsDatabase<typeof Schema>;

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const SCAN_LIMIT = 5000; // bound for in-memory prefix search over one agency

/** Postgres implementation. Every query is scoped by agencyId; PHI is encrypted before it is written. */
export function createPgRepository(db: Db, crypto: Crypto): Repository {
  const toCaregiver = async (r: typeof caregivers.$inferSelect): Promise<Caregiver> => ({
    id: r.id, agencyId: r.agencyId, name: await crypto.decrypt(r.agencyId, r.name), avatarUrl: r.avatarUrl,
    weeklyHours: r.weeklyHours, weeklyLimit: r.weeklyLimit, skills: r.skills, onShift: r.onShift, flagged: r.flagged,
  });
  const toVisit = async (r: typeof visits.$inferSelect): Promise<Visit> => ({
    id: r.id, agencyId: r.agencyId, caregiverId: r.caregiverId, patientId: r.patientId,
    label: await crypto.decrypt(r.agencyId, r.label), startsAt: r.startsAt, endsAt: r.endsAt,
    status: r.status as StoredStatus, requirement: r.requirement,
  });

  const build = (d: Db): Repository => ({
    async caregivers(agencyId) {
      const rows = await d.select().from(caregivers).where(eq(caregivers.agencyId, agencyId)).orderBy(asc(caregivers.id));
      return Promise.all(rows.map(toCaregiver));
    },

    async visits(agencyId, q: VisitQuery) {
      const where = and(
        eq(visits.agencyId, agencyId), lt(visits.startsAt, q.to), gte(visits.endsAt, q.from),
        q.caregiverId ? eq(visits.caregiverId, q.caregiverId) : undefined,
      );
      const rows = await d.select().from(visits).where(where).orderBy(asc(visits.startsAt), asc(visits.id));
      return Promise.all(rows.map(toVisit));
    },

    async visit(agencyId, id) {
      const [r] = await d.select().from(visits).where(and(eq(visits.agencyId, agencyId), eq(visits.id, id))).limit(1);
      return r ? toVisit(r) : null;
    },

    async assignVisit(agencyId, visitId, caregiverId, status) {
      const [r] = await d.update(visits)
        .set({ caregiverId, status: status ?? (caregiverId ? "scheduled" : "open"), updatedAt: new Date() })
        .where(and(eq(visits.agencyId, agencyId), eq(visits.id, visitId)))
        .returning();
      if (!r) throw new Error("Visit not found");
      return toVisit(r);
    },

    async createPatient(agencyId, input: PatientInput): Promise<Patient> {
      const e = (v?: string) => (v ? crypto.encrypt(agencyId, v) : Promise.resolve(null));
      const [name, dob, address, notes, nameIdx] = await Promise.all([
        crypto.encrypt(agencyId, input.name), e(input.dob), e(input.address), e(input.notes),
        crypto.blindIndex(agencyId, norm(input.name)),
      ]);
      const [r] = await d.insert(patients).values({ agencyId, name, nameIdx, dob, address, notes }).returning();
      return { id: r!.id, agencyId, name: input.name, createdAt: r!.createdAt };
    },

    async countPatientsSince(agencyId, since) {
      const [r] = await d.select({ n: sql<number>`count(*)::int` }).from(patients)
        .where(and(eq(patients.agencyId, agencyId), gte(patients.createdAt, since)));
      return r?.n ?? 0;
    },

    async claims(agencyId): Promise<ClaimRow[]> {
      return d.select().from(claims).where(eq(claims.agencyId, agencyId)).orderBy(asc(claims.createdAt));
    },

    async search(agencyId, query, limit) {
      const q = norm(query);
      if (!q) return [];
      const hits: SearchHit[] = [];
      const [pRows, cRows] = await Promise.all([
        d.select().from(patients).where(eq(patients.agencyId, agencyId)).limit(SCAN_LIMIT),
        d.select().from(caregivers).where(eq(caregivers.agencyId, agencyId)).limit(SCAN_LIMIT),
      ]);
      for (const r of pRows) {
        const name = await crypto.decrypt(agencyId, r.name);
        if (norm(name).includes(q)) hits.push({ kind: "patient", id: r.id, title: name });
      }
      for (const r of cRows) {
        const name = await crypto.decrypt(agencyId, r.name);
        if (norm(name).includes(q)) hits.push({ kind: "caregiver", id: r.id, title: name });
      }
      if (/^[0-9a-f-]{4,}$/.test(q)) {
        const cl = await d.select().from(claims)
          .where(and(eq(claims.agencyId, agencyId), sql`${claims.id}::text like ${q + "%"}`)).limit(limit);
        for (const c of cl) hits.push({ kind: "claim", id: c.id, title: `Claim ${c.id.slice(0, 8)}`, subtitle: c.status });
      }
      return hits.slice(0, limit);
    },

    async transaction<T>(_agencyId: Id, fn: (tx: Repository) => Promise<T>) {
      return d.transaction((t) => fn(build(t as unknown as Db)));
    },
  });

  return build(db);
}
