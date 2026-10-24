import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { runContract } from "@hekara/contract-tests";
import { createCrypto, generateMasterKey, masterKeyProvider } from "@hekara/crypto";
import * as schema from "@hekara/db/schema";
import { createPgAudit, createPgRealtime, createPgRepository } from "./index";

const url = process.env.DATABASE_URL ?? "postgres://hekara:hekara@localhost:5442/hekara";

runContract("node + postgres", async () => {
  const sql = postgres(url, { max: 10 });
  const db = drizzle(sql, { schema });
  const crypto = createCrypto(masterKeyProvider({ t1: generateMasterKey() }, "t1"));
  const enc = (agencyId: string, v: string) => crypto.encrypt(agencyId, v);

  return {
    repo: createPgRepository(db, crypto),
    audit: createPgAudit(db, crypto),
    realtime: createPgRealtime(sql),
    fixtures: {
      async agency() {
        const [r] = await db.insert(schema.agencies).values({ name: "Contract Test Agency" }).returning();
        return r!.id;
      },
      async caregiver(agencyId, p = {}) {
        const name = p.name ?? "Test Caregiver";
        const [r] = await db
          .insert(schema.caregivers)
          .values({
            agencyId,
            name: await enc(agencyId, name),
            nameIdx: await crypto.blindIndex(agencyId, name.toLowerCase()),
            weeklyHours: p.weeklyHours ?? 20,
            weeklyLimit: p.weeklyLimit ?? 40,
            skills: p.skills ?? [],
          })
          .returning();
        return {
          id: r!.id,
          agencyId,
          name,
          avatarUrl: null,
          weeklyHours: r!.weeklyHours,
          weeklyLimit: r!.weeklyLimit,
          skills: r!.skills,
          onShift: false,
          flagged: false,
        };
      },
      async visit(agencyId, p) {
        const label = p.label ?? "Visit";
        const [r] = await db
          .insert(schema.visits)
          .values({
            agencyId,
            caregiverId: p.caregiverId ?? null,
            patientId: null,
            label: await enc(agencyId, label),
            startsAt: p.startsAt,
            endsAt: p.endsAt,
            status: p.status ?? "scheduled",
            requirement: p.requirement ?? null,
          })
          .returning();
        return {
          id: r!.id,
          agencyId,
          caregiverId: r!.caregiverId,
          patientId: null,
          label,
          startsAt: r!.startsAt,
          endsAt: r!.endsAt,
          status: r!.status as never,
          requirement: r!.requirement,
        };
      },
      async claim(agencyId, p) {
        const [r] = await db
          .insert(schema.claims)
          .values({
            agencyId,
            amountCents: p.amountCents,
            status: p.status ?? "draft",
            visitId: p.visitId ?? null,
            createdAt: p.createdAt ?? new Date(),
          })
          .returning();
        return r!.id;
      },
      async rawCarePlanTitle(id) {
        const [r] = await db.select({ t: schema.carePlans.title }).from(schema.carePlans).where(eq(schema.carePlans.id, id));
        return r!.t;
      },
      async rawPatientName(id) {
        const [r] = await db.select({ n: schema.patients.name }).from(schema.patients).where(eq(schema.patients.id, id));
        return r!.n;
      },
      async rawVisitLabel(id) {
        const [r] = await db.select({ n: schema.visits.label }).from(schema.visits).where(eq(schema.visits.id, id));
        return r!.n;
      },
      async tamperAudit(agencyId, seq) {
        await db
          .update(schema.auditLog)
          .set({ action: "tampered" })
          .where(and(eq(schema.auditLog.agencyId, agencyId), eq(schema.auditLog.seq, seq)));
      },
    },
    async close() {
      // Remove test tenants (cascades to their rows); audit_log has no FK so clear it explicitly.
      const ids = (
        await db.select({ id: schema.agencies.id }).from(schema.agencies).where(eq(schema.agencies.name, "Contract Test Agency"))
      ).map((r) => r.id);
      for (const id of ids) {
        await db.delete(schema.auditLog).where(eq(schema.auditLog.agencyId, id));
        await db.delete(schema.agencies).where(eq(schema.agencies.id, id));
      }
      await sql.end({ timeout: 1 });
    },
  };
});
