import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as Schema from "@hekara/db/schema";
import { agencies, carePlans, caregivers, claims, credentials, patients, visits } from "@hekara/db/schema";
import type { Caregiver, CarePlanStatus, ClaimStatus, Id, StoredStatus, Visit } from "@hekara/core";
import type { CarePlanDetail, CarePlanInput, CarePlanPatch, CarePlanSummary, CredentialInput, CredentialRow, ClaimDetail, ClaimRow, Crypto, Page, Patient, PatientDetail, PatientInput, PatientSummary, Repository, SearchHit, VisitQuery } from "@hekara/ports";

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

  const taskList = async (agencyId: string, enc: string | null): Promise<string[]> =>
    enc ? (JSON.parse(await crypto.decrypt(agencyId, enc)) as string[]) : [];
  const summarize = async (agencyId: string, r: typeof carePlans.$inferSelect, patientName: string): Promise<CarePlanSummary> => ({
    id: r.id, patientId: r.patientId, patientName, title: await crypto.decrypt(agencyId, r.title), status: r.status,
    reviewOn: r.reviewOn, taskCount: (await taskList(agencyId, r.tasks)).length, updatedAt: r.updatedAt,
  });
  const detail = async (agencyId: string, r: typeof carePlans.$inferSelect, patientName: string): Promise<CarePlanDetail> => ({
    ...(await summarize(agencyId, r, patientName)),
    instructions: r.instructions ? await crypto.decrypt(agencyId, r.instructions) : null, tasks: await taskList(agencyId, r.tasks),
  });

  const build = (d: Db): Repository => ({
    async agency(agencyId) {
      const [r] = await d.select({ id: agencies.id, name: agencies.name }).from(agencies).where(eq(agencies.id, agencyId)).limit(1);
      return r ?? null;
    },

    async caregivers(agencyId) {
      const rows = await d.select().from(caregivers).where(eq(caregivers.agencyId, agencyId)).orderBy(asc(caregivers.createdAt), asc(caregivers.id));
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

    async renameAgency(agencyId, name) {
      await d.update(agencies).set({ name }).where(eq(agencies.id, agencyId));
    },

    async carePlans(agencyId, q: Page & { status?: CarePlanStatus; patientId?: Id }) {
      const where = and(eq(carePlans.agencyId, agencyId), q.status ? eq(carePlans.status, q.status) : undefined, q.patientId ? eq(carePlans.patientId, q.patientId) : undefined);
      const [rows, [c]] = await Promise.all([
        d.select({ p: carePlans, patient: patients.name }).from(carePlans)
          .innerJoin(patients, and(eq(patients.id, carePlans.patientId), eq(patients.agencyId, agencyId)))
          .where(where).orderBy(desc(carePlans.updatedAt), desc(carePlans.id)).limit(q.limit).offset(q.offset),
        d.select({ n: sql<number>`count(*)::int` }).from(carePlans).where(where),
      ]);
      const items: CarePlanSummary[] = await Promise.all(rows.map(async (r) => summarize(agencyId, r.p, await crypto.decrypt(agencyId, r.patient))));
      return { items, total: c?.n ?? 0 };
    },

    async carePlan(agencyId, id): Promise<CarePlanDetail | null> {
      const [r] = await d.select({ p: carePlans, patient: patients.name }).from(carePlans)
        .innerJoin(patients, and(eq(patients.id, carePlans.patientId), eq(patients.agencyId, agencyId)))
        .where(and(eq(carePlans.agencyId, agencyId), eq(carePlans.id, id))).limit(1);
      return r ? detail(agencyId, r.p, await crypto.decrypt(agencyId, r.patient)) : null;
    },

    async createCarePlan(agencyId, input: CarePlanInput): Promise<CarePlanDetail> {
      const [pat] = await d.select({ id: patients.id, name: patients.name }).from(patients)
        .where(and(eq(patients.agencyId, agencyId), eq(patients.id, input.patientId))).limit(1);
      if (!pat) throw new Error("Patient not found");
      const [r] = await d.insert(carePlans).values({
        agencyId, patientId: pat.id, title: await crypto.encrypt(agencyId, input.title),
        instructions: input.instructions ? await crypto.encrypt(agencyId, input.instructions) : null,
        tasks: input.tasks?.length ? await crypto.encrypt(agencyId, JSON.stringify(input.tasks)) : null,
        status: input.status ?? "active", reviewOn: input.reviewOn ?? null,
      }).returning();
      return detail(agencyId, r!, await crypto.decrypt(agencyId, pat.name));
    },

    async updateCarePlan(agencyId, id, patch: CarePlanPatch): Promise<CarePlanDetail> {
      const set: Partial<typeof carePlans.$inferInsert> = { updatedAt: new Date() };
      if (patch.title !== undefined) set.title = await crypto.encrypt(agencyId, patch.title);
      if (patch.instructions !== undefined) set.instructions = patch.instructions ? await crypto.encrypt(agencyId, patch.instructions) : null;
      if (patch.tasks !== undefined) set.tasks = patch.tasks.length ? await crypto.encrypt(agencyId, JSON.stringify(patch.tasks)) : null;
      if (patch.status !== undefined) set.status = patch.status;
      if (patch.reviewOn !== undefined) set.reviewOn = patch.reviewOn;
      const [r] = await d.update(carePlans).set(set).where(and(eq(carePlans.agencyId, agencyId), eq(carePlans.id, id))).returning();
      if (!r) throw new Error("Care plan not found");
      const [pat] = await d.select({ name: patients.name }).from(patients).where(eq(patients.id, r.patientId)).limit(1);
      return detail(agencyId, r, await crypto.decrypt(agencyId, pat!.name));
    },

    async credentials(agencyId): Promise<CredentialRow[]> {
      const rows = await d.select({ c: credentials, name: caregivers.name }).from(credentials)
        .innerJoin(caregivers, and(eq(caregivers.id, credentials.caregiverId), eq(caregivers.agencyId, agencyId)))
        .where(eq(credentials.agencyId, agencyId)).orderBy(asc(credentials.expiresOn), asc(credentials.id));
      return Promise.all(rows.map(async (r) => ({
        id: r.c.id, caregiverId: r.c.caregiverId, caregiverName: await crypto.decrypt(agencyId, r.name),
        kind: r.c.kind, issuedOn: r.c.issuedOn, expiresOn: r.c.expiresOn,
      })));
    },

    async addCredential(agencyId, input: CredentialInput): Promise<CredentialRow> {
      const [cg] = await d.select({ id: caregivers.id, name: caregivers.name }).from(caregivers)
        .where(and(eq(caregivers.agencyId, agencyId), eq(caregivers.id, input.caregiverId))).limit(1);
      if (!cg) throw new Error("Caregiver not found");
      const [r] = await d.insert(credentials).values({
        agencyId, caregiverId: cg.id, kind: input.kind, issuedOn: input.issuedOn ?? null, expiresOn: input.expiresOn,
      }).returning();
      return { id: r!.id, caregiverId: cg.id, caregiverName: await crypto.decrypt(agencyId, cg.name), kind: r!.kind, issuedOn: r!.issuedOn, expiresOn: r!.expiresOn };
    },

    async removeCredential(agencyId, id) {
      const gone = await d.delete(credentials).where(and(eq(credentials.agencyId, agencyId), eq(credentials.id, id))).returning({ id: credentials.id });
      return gone.length > 0;
    },

    async patients(agencyId, { limit, offset }) {
      const where = eq(patients.agencyId, agencyId);
      const [rows, [c]] = await Promise.all([
        d.select().from(patients).where(where).orderBy(desc(patients.createdAt), desc(patients.id)).limit(limit).offset(offset),
        d.select({ n: sql<number>`count(*)::int` }).from(patients).where(where),
      ]);
      const items: PatientSummary[] = await Promise.all(rows.map(async (r) => ({ id: r.id, name: await crypto.decrypt(agencyId, r.name), createdAt: r.createdAt })));
      return { items, total: c?.n ?? 0 };
    },

    async patient(agencyId, id): Promise<PatientDetail | null> {
      const [r] = await d.select().from(patients).where(and(eq(patients.agencyId, agencyId), eq(patients.id, id))).limit(1);
      if (!r) return null;
      const dec = (v: string | null) => (v ? crypto.decrypt(agencyId, v) : Promise.resolve(null));
      const [name, dob, address, notes] = await Promise.all([crypto.decrypt(agencyId, r.name), dec(r.dob), dec(r.address), dec(r.notes)]);
      return { id: r.id, name, dob, address, notes, createdAt: r.createdAt };
    },

    async claimsPage(agencyId, q: Page & { status?: ClaimStatus }) {
      const where = and(eq(claims.agencyId, agencyId), q.status ? eq(claims.status, q.status) : undefined);
      const [rows, [c]] = await Promise.all([
        d.select({ c: claims, label: visits.label, start: visits.startsAt }).from(claims)
          .leftJoin(visits, and(eq(visits.id, claims.visitId), eq(visits.agencyId, agencyId)))
          .where(where).orderBy(desc(claims.createdAt), desc(claims.id)).limit(q.limit).offset(q.offset),
        d.select({ n: sql<number>`count(*)::int` }).from(claims).where(where),
      ]);
      const items: ClaimDetail[] = await Promise.all(rows.map(async (r) => ({
        ...r.c, visitLabel: r.label ? await crypto.decrypt(agencyId, r.label) : null, visitStart: r.start ?? null,
      })));
      return { items, total: c?.n ?? 0 };
    },

    async claimCounts(agencyId) {
      const rows = await d.select({ status: claims.status, n: sql<number>`count(*)::int` }).from(claims)
        .where(eq(claims.agencyId, agencyId)).groupBy(claims.status);
      const out: Record<ClaimStatus, number> = { draft: 0, submitted: 0, paid: 0, denied: 0 };
      for (const r of rows) out[r.status] = r.n;
      return out;
    },

    async claim(agencyId, id): Promise<ClaimRow | null> {
      const [r] = await d.select().from(claims).where(and(eq(claims.agencyId, agencyId), eq(claims.id, id))).limit(1);
      return r ?? null;
    },

    async setClaimStatus(agencyId, id, status): Promise<ClaimRow> {
      const [r] = await d.update(claims).set({ status }).where(and(eq(claims.agencyId, agencyId), eq(claims.id, id))).returning();
      if (!r) throw new Error("Claim not found");
      return r;
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
