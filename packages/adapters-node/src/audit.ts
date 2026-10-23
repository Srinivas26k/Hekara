import { createHash } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as Schema from "@hekara/db/schema";
import { auditLog } from "@hekara/db/schema";
import type { Audit, AuditEntry, Crypto } from "@hekara/ports";

type Db = PostgresJsDatabase<typeof Schema>;

interface Hashable {
  seq: number; agencyId: string; userId: string | null; action: string; entity: string;
  entityId: string | null; meta: string | null; createdAt: string;
}
export const entryHash = (prevHash: string, e: Hashable): string =>
  createHash("sha256")
    .update(prevHash + JSON.stringify([e.seq, e.agencyId, e.userId, e.action, e.entity, e.entityId, e.meta, e.createdAt]))
    .digest("hex");

/** Append-only, hash-chained audit log. An advisory lock serializes appends per agency. */
export function createPgAudit(db: Db, crypto: Crypto): Audit {
  return {
    async append(entry: AuditEntry) {
      const meta = entry.meta ? await crypto.encrypt(entry.agencyId, JSON.stringify(entry.meta)) : null;
      await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"audit:" + entry.agencyId}))`);
        const [last] = await tx.select({ seq: auditLog.seq, hash: auditLog.hash }).from(auditLog)
          .where(eq(auditLog.agencyId, entry.agencyId)).orderBy(desc(auditLog.seq)).limit(1);
        const seq = (last?.seq ?? 0) + 1;
        const prevHash = last?.hash ?? "";
        const createdAt = new Date();
        const hash = entryHash(prevHash, {
          seq, agencyId: entry.agencyId, userId: entry.userId, action: entry.action, entity: entry.entity,
          entityId: entry.entityId ?? null, meta, createdAt: createdAt.toISOString(),
        });
        await tx.insert(auditLog).values({
          agencyId: entry.agencyId, userId: entry.userId, action: entry.action, entity: entry.entity,
          entityId: entry.entityId ?? null, meta, seq, prevHash, hash, createdAt,
        });
      });
    },

    async verify(agencyId) {
      const rows = await db.select().from(auditLog).where(and(eq(auditLog.agencyId, agencyId))).orderBy(asc(auditLog.seq));
      let prev = "";
      for (const [i, r] of rows.entries()) {
        const expected = entryHash(prev, {
          seq: r.seq, agencyId, userId: r.userId, action: r.action, entity: r.entity,
          entityId: r.entityId, meta: r.meta, createdAt: r.createdAt.toISOString(),
        });
        if (r.seq !== i + 1 || r.prevHash !== prev || r.hash !== expected) return i;
        prev = r.hash;
      }
      return null;
    },
  };
}
