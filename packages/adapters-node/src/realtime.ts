import type postgres from "postgres";
import type { AppEvent, Realtime } from "@hekara/ports";

const CHANNEL = "hekara_events";

/** Realtime over Postgres LISTEN/NOTIFY: works across processes with no extra infrastructure. */
export function createPgRealtime(sql: ReturnType<typeof postgres>): Realtime {
  const subs = new Map<string, Set<(e: AppEvent) => void>>();
  let listening: Promise<unknown> | null = null;

  const ensureListening = () =>
    (listening ??= sql.listen(CHANNEL, (payload) => {
      let e: AppEvent;
      try {
        e = JSON.parse(payload) as AppEvent;
      } catch {
        return;
      }
      subs.get(e.agencyId)?.forEach((fn) => fn(e));
    }));

  return {
    async publish(event) {
      await sql.notify(CHANNEL, JSON.stringify(event)); // ids only, never PHI
    },
    async subscribe(agencyId, onEvent) {
      await ensureListening();
      const set = subs.get(agencyId) ?? new Set();
      set.add(onEvent);
      subs.set(agencyId, set);
      return () => {
        set.delete(onEvent);
        if (set.size === 0) subs.delete(agencyId);
      };
    },
  };
}
