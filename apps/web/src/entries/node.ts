import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { getConnInfo } from "@hono/node-server/conninfo";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { createCrypto } from "@hekara/crypto";
import * as schema from "@hekara/db/schema";
import {
  createPgAudit, createPgRealtime, createPgRepository, fsBlob, intervalScheduler, memoryQueue, envSecrets, systemClock, argon2idHasher,
} from "@hekara/adapters-node";
import type { Ports } from "@hekara/ports";
import { createApp } from "../app";
import { securityHeaders } from "../security";
import { loadConfig } from "../config";
import { createAuth } from "../auth";
import { identifyFromSession } from "../identity";
import { createInvites } from "../invites";

const cfg = loadConfig();

const sql = postgres(cfg.databaseUrl, { max: 5, idle_timeout: 20 });
const db = drizzle(sql, { schema });
const crypto = createCrypto(cfg.keys);
const ports: Ports = {
  clock: systemClock, secrets: envSecrets, crypto,
  repo: createPgRepository(db, crypto), audit: createPgAudit(db, crypto), realtime: createPgRealtime(sql),
  queue: memoryQueue(), blob: fsBlob(process.env.BLOB_DIR ?? "./.data/blobs"), scheduler: intervalScheduler(),
};

const userNames = async (agencyId: string, ids: string[]) => {
  if (ids.length === 0) return new Map<string, string>();
  const rows = await db.select({ id: schema.user.id, name: schema.user.name }).from(schema.user)
    .where(and(eq(schema.user.agencyId, agencyId), inArray(schema.user.id, ids)));
  return new Map(rows.map((r) => [r.id, r.name]));
};

/** Verifies every agency's audit chain once a day and shouts if one is broken. Run it on one instance only. */
ports.scheduler.every("audit-verify", "@every 86400s", async () => {
  for (const a of await db.select({ id: schema.agencies.id }).from(schema.agencies)) {
    const broken = await ports.audit.verify(a.id);
    if (broken !== null) console.error(`AUDIT CHAIN BROKEN for agency ${a.id} at entry ${broken}`);
  }
});

const { auth, links } = createAuth({ db, hasher: argon2idHasher(), audit: ports.audit, appUrl: cfg.appUrl, secret: cfg.authSecret });
const api = createApp({
  ports,
  identify: identifyFromSession(auth),
  authHandler: (req) => auth.handler(req),
  invites: createInvites({ auth, links, db, appUrl: cfg.appUrl }),
  userNames,
  clientKey: (c) => getConnInfo(c).remote.address ?? "unknown",
  allowedOrigin: new URL(cfg.appUrl).origin,
  allowTimeTravel: !cfg.production, // dev only: ?at=HH:MM pins the clock
});

const root = new Hono();
root.use("*", securityHeaders());
root.route("/", api);
const publicDir = fileURLToPath(new URL("../../public", import.meta.url));
root.use("/*", serveStatic({ root: publicDir, rewriteRequestPath: (p) => p }));

serve({ fetch: root.fetch, port: cfg.port, hostname: "127.0.0.1" }, (i) => console.log(`Hekara listening on http://127.0.0.1:${i.port}`));

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => { void sql.end({ timeout: 2 }).finally(() => process.exit(0)); });
}
