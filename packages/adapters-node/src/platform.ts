import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import type { Blob, Clock, Queue, Scheduler, Secrets } from "@hekara/ports";

export const systemClock: Clock = { now: () => new Date() };

export const envSecrets: Secrets = {
  async get(name) {
    const v = process.env[name];
    if (!v) throw new Error(`Secret ${name} is not set`);
    return v;
  },
};

/** Filesystem blobs. Keys are confined to the root directory. */
export function fsBlob(root: string): Blob {
  const base = resolve(root);
  const path = (key: string) => {
    const p = resolve(join(base, key));
    if (p !== base && !p.startsWith(base + sep)) throw new Error("Invalid blob key");
    return p;
  };
  return {
    async put(key, data) { const p = path(key); await mkdir(dirname(p), { recursive: true }); await writeFile(p, data); },
    async get(key) { try { return new Uint8Array(await readFile(path(key))); } catch { return null; } },
    async delete(key) { await rm(path(key), { force: true }); },
  };
}

/** In-process queue for single-node deployments and tests. Swap for Postgres, SQS or NATS in larger setups. */
export function memoryQueue(): Queue & { drain(topic: string): unknown[] } {
  const topics = new Map<string, unknown[]>();
  return {
    async send(topic, message) { (topics.get(topic) ?? topics.set(topic, []).get(topic)!).push(message); },
    drain(topic) { const m = topics.get(topic) ?? []; topics.set(topic, []); return m; },
  };
}

/** Minimal interval scheduler: supports "every N minutes" crons (star-slash-N) and "@every Ns". */
export function intervalScheduler(): Scheduler & { stop(): void } {
  const timers: NodeJS.Timeout[] = [];
  return {
    every(name, cron, job) {
      const m = /^\*\/(\d+) \* \* \* \*$/.exec(cron);
      const s = /^@every (\d+)s$/.exec(cron);
      const ms = m ? Number(m[1]) * 60_000 : s ? Number(s[1]) * 1000 : null;
      if (!ms) throw new Error(`Unsupported schedule for ${name}: ${cron}`);
      const t = setInterval(() => void job().catch((e) => console.error(`job ${name} failed`, e instanceof Error ? e.message : e)), ms);
      t.unref();
      timers.push(t);
    },
    stop() { timers.forEach(clearInterval); },
  };
}
