import type { Visit, VisitStatus } from "./types";

export const HOUR_MS = 3_600_000;

export const hoursBetween = (a: Date, b: Date): number => (b.getTime() - a.getTime()) / HOUR_MS;

export const overlaps = (a: Pick<Visit, "startsAt" | "endsAt">, b: Pick<Visit, "startsAt" | "endsAt">): boolean =>
  a.startsAt < b.endsAt && b.startsAt < a.endsAt;

/** Derive the UI status. Stored attention/open/ai_suggestion always win; otherwise the clock decides. */
export function deriveStatus(v: Pick<Visit, "status" | "startsAt" | "endsAt">, now: Date): VisitStatus {
  if (v.status !== "scheduled") return v.status;
  if (v.endsAt <= now) return "done";
  if (v.startsAt <= now) return "in_progress";
  return "scheduled";
}
