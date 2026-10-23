import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { getConnInfo } from "@hono/node-server/conninfo";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { createCrypto } from "@hekara/crypto";
import * as schema from "@hekara/db/schema";
import {
  createPgAudit, createPgRealtime, createPgRepository, fsBlob, intervalScheduler, memoryQueue, envSecrets, systemClock,
} from "@hekara/adapters-node";
import type { Ports } from "@hekara/ports";
import { createApp } from "../app";
import { securityHeaders } from "../security";
import { loadConfig } from "../config";
import { HttpError } from "../errors";

const cfg = loadConfig();
const production = process.env.NODE_ENV === "production";
// Authentication arrives in a later milestone; refuse to run unauthenticated in production.
if (production) throw new Error("Authentication is not implemented yet: refusing to start with NODE_ENV=production");

const sql = postgres(cfg.databaseUrl, { max: 5, idle_timeout: 20 });
const db = drizzle(sql, { schema });
const crypto = createCrypto(cfg.keys);
const ports: Ports = {
  clock: systemClock, secrets: envSecrets, crypto,
  repo: createPgRepository(db, crypto), audit: createPgAudit(db, crypto), realtime: createPgRealtime(sql),
  queue: memoryQueue(), blob: fsBlob(process.env.BLOB_DIR ?? "./.data/blobs"), scheduler: intervalScheduler(),
};

// Development identity: the first agency (or DEV_AGENCY_ID). Replaced by real sessions with auth.
let devAgency = process.env.DEV_AGENCY_ID ?? "";
async function identify() {
  if (!devAgency) {
    const [a] = await db.select({ id: schema.agencies.id }).from(schema.agencies).limit(1);
    if (!a) throw new HttpError(401, "no_agency", "No agency found; run pnpm db:seed");
    devAgency = a.id;
  }
  return { agencyId: devAgency, userId: "dev" };
}

const origin = process.env.APP_URL ?? `http://localhost:${cfg.port}`;
const api = createApp({
  ports, identify,
  clientKey: (c) => getConnInfo(c).remote.address ?? "unknown",
  allowedOrigin: new URL(origin).origin,
  allowTimeTravel: true,
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
