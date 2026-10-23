import type { Caregiver, Id, Suggestion, Visit } from "./types";
import { hoursBetween, overlaps } from "./time";

export const OVERTIME_WATCH_RATIO = 0.9;

export const visitHours = (v: Pick<Visit, "startsAt" | "endsAt">): number => hoursBetween(v.startsAt, v.endsAt);

/** A caregiver can take a visit if skills match, nothing overlaps, and the weekly limit holds. */
export function isEligible(c: Caregiver, visit: Visit, assigned: readonly Visit[]): boolean {
  if (visit.requirement && !c.skills.includes(visit.requirement)) return false;
  if (assigned.some((v) => v.caregiverId === c.id && v.id !== visit.id && overlaps(v, visit))) return false;
  return c.weeklyHours + visitHours(visit) <= c.weeklyLimit;
}

/** Fewest projected overtime hours first, then lowest current hours, then name for stability. */
export function rankCandidates(visit: Visit, caregivers: readonly Caregiver[], assigned: readonly Visit[]): Caregiver[] {
  const h = visitHours(visit);
  return caregivers
    .filter((c) => isEligible(c, visit, assigned))
    .sort((a, b) => {
      const oa = Math.max(0, a.weeklyHours + h - a.weeklyLimit);
      const ob = Math.max(0, b.weeklyHours + h - b.weeklyLimit);
      return oa - ob || a.weeklyHours - b.weeklyHours || a.name.localeCompare(b.name);
    });
}

export const bestCandidate = (visit: Visit, caregivers: readonly Caregiver[], assigned: readonly Visit[]): Caregiver | undefined =>
  rankCandidates(visit, caregivers, assigned)[0];

export interface OvertimeEntry { caregiver: Caregiver; ratio: number }

/** Caregivers at or above the watch ratio, most loaded first. */
export function overtimeWatch(caregivers: readonly Caregiver[], ratio = OVERTIME_WATCH_RATIO): OvertimeEntry[] {
  return caregivers
    .map((caregiver) => ({ caregiver, ratio: caregiver.weeklyHours / caregiver.weeklyLimit }))
    .filter((e) => e.ratio >= ratio)
    .sort((a, b) => b.ratio - a.ratio);
}

/** Hours a caregiver is projected over their limit once their remaining scheduled visits are worked. */
export function projectedOvertime(c: Caregiver, remaining: readonly Visit[]): number {
  const pending = remaining.filter((v) => v.caregiverId === c.id).reduce((s, v) => s + visitHours(v), 0);
  return Math.max(0, c.weeklyHours + pending - c.weeklyLimit);
}

/**
 * Deterministic suggestions: fill each open shift with the best candidate, then move visits off
 * caregivers projected over their limit. `remaining` is every visit that has not finished yet.
 */
export function buildSuggestions(caregivers: readonly Caregiver[], remaining: readonly Visit[]): Suggestion[] {
  const out: Suggestion[] = [];
  const taken = new Set<Id>();
  const working = remaining.map((v) => ({ ...v }));
  const byId = new Map(working.map((v) => [v.id, v]));
  const hoursAdded = new Map<Id, number>();
  const view = () => caregivers.map((c) => ({ ...c, weeklyHours: c.weeklyHours + (hoursAdded.get(c.id) ?? 0) }));

  for (const open of working.filter((v) => v.status === "open" && !v.caregiverId)) {
    const pick = bestCandidate(open, view(), working);
    if (!pick) continue;
    out.push({ kind: "fill", visitId: open.id, caregiverId: pick.id, hoursSaved: 0 });
    open.caregiverId = pick.id; taken.add(open.id);
    hoursAdded.set(pick.id, (hoursAdded.get(pick.id) ?? 0) + visitHours(open));
  }

  for (const c of caregivers) {
    let over = projectedOvertime(c, working);
    if (over <= 0) continue;
    const movable = working
      .filter((v) => v.caregiverId === c.id && v.status === "scheduled" && !taken.has(v.id))
      .sort((a, b) => visitHours(b) - visitHours(a));
    for (const v of movable) {
      if (over <= 0) break;
      const pick = bestCandidate(v, view().filter((x) => x.id !== c.id), working);
      if (!pick) continue;
      const saved = Math.min(over, visitHours(v));
      out.push({ kind: "move", visitId: v.id, fromCaregiverId: c.id, caregiverId: pick.id, hoursSaved: saved });
      byId.get(v.id)!.caregiverId = pick.id; taken.add(v.id);
      hoursAdded.set(pick.id, (hoursAdded.get(pick.id) ?? 0) + visitHours(v));
      over -= saved;
    }
  }
  return out;
}

export const summarize = (s: readonly Suggestion[]) => ({
  count: s.length,
  hoursSaved: Math.round(s.reduce((n, x) => n + x.hoursSaved, 0) * 10) / 10,
  shiftsFilled: s.filter((x) => x.kind === "fill").length,
});

export type ClaimStatus = "draft" | "submitted" | "paid" | "denied";

const CLAIM_FLOW: Record<ClaimStatus, readonly ClaimStatus[]> = {
  draft: ["submitted"],
  submitted: ["paid", "denied"],
  denied: ["draft"], // fix and resubmit
  paid: [],
};
export const canTransitionClaim = (from: ClaimStatus, to: ClaimStatus): boolean => CLAIM_FLOW[from].includes(to);
export const nextClaimStatuses = (from: ClaimStatus): readonly ClaimStatus[] => CLAIM_FLOW[from];
