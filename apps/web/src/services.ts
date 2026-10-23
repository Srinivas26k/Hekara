import {
  bestCandidate, buildSuggestions, deriveStatus, isEligible, overtimeWatch, summarize,
  type Caregiver, type DayScheduleDto, type OverviewDto, type PersonDto, type RowDto, type SearchHitDto,
  type Suggestion, type SuggestionDto, type Visit, type VisitDto, type WeekScheduleDto, visitHours,
} from "@hekara/core";
import type { PatientInput, Ports } from "@hekara/ports";
import { HttpError } from "./errors";

export interface Ctx { ports: Ports; agencyId: string; userId: string | null; now: Date }

const DAY = 86_400_000;

/** Local-day bounds. The server timezone (TZ) defines the agency day until per-agency timezones exist. */
export function dayRange(now: Date, date?: string): { from: Date; to: Date; date: string } {
  const base = date ? new Date(`${date}T00:00:00`) : new Date(now);
  base.setHours(0, 0, 0, 0);
  const to = new Date(base);
  to.setDate(to.getDate() + 1);
  return { from: base, to, date: ymd(base) };
}
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const person = (c: Caregiver): PersonDto => ({ id: c.id, name: c.name, avatarUrl: c.avatarUrl });
const visitDto = (v: Visit, now: Date): VisitDto => ({
  id: v.id, label: v.label, start: v.startsAt.toISOString(), end: v.endsAt.toISOString(),
  status: deriveStatus(v, now), requirement: v.requirement,
});

export async function daySchedule(ctx: Ctx, opts: { date?: string; caregiver?: string }): Promise<DayScheduleDto> {
  const { from, to, date } = dayRange(ctx.now, opts.date);
  const [people, visits] = await Promise.all([
    ctx.ports.repo.caregivers(ctx.agencyId),
    ctx.ports.repo.visits(ctx.agencyId, { from, to }),
  ]);
  const open = visits.filter((v) => !v.caregiverId).map((v) => visitDto(v, ctx.now));
  const rows: RowDto[] = people
    .filter((c) => !opts.caregiver || c.id === opts.caregiver)
    .map((c) => ({ ...person(c), flagged: c.flagged, visits: visits.filter((v) => v.caregiverId === c.id).map((v) => visitDto(v, ctx.now)) }))
    .filter((r) => r.visits.length > 0);
  await ctx.ports.audit.append({ agencyId: ctx.agencyId, userId: ctx.userId, action: "schedule.read", entity: "schedule", entityId: date });
  return { view: "day", date, now: ctx.now.toISOString(), visitCount: visits.length, rows, open: opts.caregiver ? [] : open };
}

export async function weekSchedule(ctx: Ctx, opts: { date?: string; caregiver?: string }): Promise<WeekScheduleDto> {
  const { from } = dayRange(ctx.now, opts.date);
  const start = new Date(from);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Monday
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(d.getDate() + i); return d; });
  const [people, visits] = await Promise.all([
    ctx.ports.repo.caregivers(ctx.agencyId),
    ctx.ports.repo.visits(ctx.agencyId, { from: start, to: end }),
  ]);
  const rows = people
    .filter((c) => !opts.caregiver || c.id === opts.caregiver)
    .map((c) => ({
      ...person(c), weeklyHours: c.weeklyHours, weeklyLimit: c.weeklyLimit,
      days: days.map((d) => {
        const mine = visits.filter((v) => v.caregiverId === c.id && v.startsAt >= d && v.startsAt.getTime() < d.getTime() + DAY);
        return { visits: mine.length, hours: Math.round(mine.reduce((s, v) => s + visitHours(v), 0) * 10) / 10 };
      }),
    }))
    .filter((r) => r.days.some((d) => d.visits > 0));
  await ctx.ports.audit.append({ agencyId: ctx.agencyId, userId: ctx.userId, action: "schedule.read", entity: "schedule", entityId: `week:${ymd(start)}` });
  return { view: "week", days: days.map(ymd), now: ctx.now.toISOString(), rows };
}

async function suggestionsFor(ctx: Ctx, people: Caregiver[], visits: Visit[]) {
  const remaining = visits.filter((v) => v.endsAt > ctx.now);
  const raw = buildSuggestions(people, remaining);
  const byV = new Map(visits.map((v) => [v.id, v]));
  const byC = new Map(people.map((c) => [c.id, c]));
  const items: SuggestionDto[] = raw.map((s) => {
    const v = byV.get(s.visitId)!;
    return {
      kind: s.kind, visitId: s.visitId, label: v.label, start: v.startsAt.toISOString(), end: v.endsAt.toISOString(),
      caregiverId: s.caregiverId, caregiverName: byC.get(s.caregiverId)!.name,
      fromCaregiverName: s.kind === "move" ? byC.get(s.fromCaregiverId)!.name : undefined, hoursSaved: s.hoursSaved,
    };
  });
  return { raw, items, ...summarize(raw) };
}

export async function overview(ctx: Ctx): Promise<OverviewDto> {
  const { from, to, date } = dayRange(ctx.now);
  const weekAgo = new Date(ctx.now.getTime() - 7 * DAY);
  const [agency, people, visits, newPatients, claims] = await Promise.all([
    ctx.ports.repo.agency(ctx.agencyId),
    ctx.ports.repo.caregivers(ctx.agencyId),
    ctx.ports.repo.visits(ctx.agencyId, { from, to }),
    ctx.ports.repo.countPatientsSince(ctx.agencyId, weekAgo),
    ctx.ports.repo.claims(ctx.agencyId),
  ]);
  const active = new Set(visits.filter((v) => v.caregiverId && v.startsAt <= ctx.now && ctx.now < v.endsAt).map((v) => v.caregiverId!));
  const onShift = people.filter((c) => active.has(c.id));
  const sugg = await suggestionsFor(ctx, people, visits);
  const status = (v: Visit) => deriveStatus(v, ctx.now);
  return {
    agency: { name: agency?.name ?? "" },
    date, now: ctx.now.toISOString(), visitCount: visits.length,
    badges: {
      patients: newPatients,
      schedule: visits.filter((v) => status(v) === "attention" || status(v) === "open").length,
      claims: claims.filter((c) => c.status === "draft").length,
    },
    onShift: { count: onShift.length, total: people.length, avatars: onShift.slice(0, 4).map(person) },
    openShifts: visits.filter((v) => !v.caregiverId).map((v) => visitDto(v, ctx.now)),
    overtime: overtimeWatch(people).map((e) => ({ ...person(e.caregiver), hours: e.caregiver.weeklyHours, limit: e.caregiver.weeklyLimit, ratio: e.ratio })),
    suggestions: { count: sugg.count, hoursSaved: sugg.hoursSaved, shiftsFilled: sugg.shiftsFilled, items: sugg.items },
  };
}

async function dayContext(ctx: Ctx, visit: Visit) {
  const { from, to } = dayRange(visit.startsAt);
  const [people, visits] = await Promise.all([
    ctx.ports.repo.caregivers(ctx.agencyId),
    ctx.ports.repo.visits(ctx.agencyId, { from, to }),
  ]);
  return { people, visits };
}

async function record(ctx: Ctx, action: string, entityId: string, meta?: Record<string, unknown>) {
  await ctx.ports.audit.append({ agencyId: ctx.agencyId, userId: ctx.userId, action, entity: "visit", entityId, meta });
  await ctx.ports.realtime.publish({ type: "visit.updated", agencyId: ctx.agencyId, entityId });
  await ctx.ports.realtime.publish({ type: "suggestions.changed", agencyId: ctx.agencyId });
}

export async function fillVisit(ctx: Ctx, visitId: string, caregiverId?: string): Promise<{ visit: VisitDto; caregiver: PersonDto }> {
  const visit = await ctx.ports.repo.visit(ctx.agencyId, visitId);
  if (!visit) throw new HttpError(404, "not_found", "Not found");
  if (visit.caregiverId || visit.status !== "open") throw new HttpError(409, "not_open", "This shift is no longer open");
  const { people, visits } = await dayContext(ctx, visit);
  const pick = caregiverId
    ? people.find((c) => c.id === caregiverId && isEligible(c, visit, visits))
    : bestCandidate(visit, people, visits);
  if (!pick) throw new HttpError(422, "no_eligible_caregiver", "No eligible caregiver is available");
  const updated = await ctx.ports.repo.transaction(ctx.agencyId, async (tx) => {
    const fresh = await tx.visit(ctx.agencyId, visitId);
    if (!fresh || fresh.caregiverId) throw new HttpError(409, "not_open", "This shift is no longer open");
    return tx.assignVisit(ctx.agencyId, visitId, pick.id, "scheduled");
  });
  await record(ctx, "visit.fill", visitId, { caregiverId: pick.id });
  return { visit: visitDto(updated, ctx.now), caregiver: person(pick) };
}

export async function unfillVisit(ctx: Ctx, visitId: string): Promise<VisitDto> {
  const visit = await ctx.ports.repo.visit(ctx.agencyId, visitId);
  if (!visit) throw new HttpError(404, "not_found", "Not found");
  const updated = await ctx.ports.repo.assignVisit(ctx.agencyId, visitId, null, "open");
  await record(ctx, "visit.unfill", visitId);
  return visitDto(updated, ctx.now);
}

export async function optimize(ctx: Ctx) {
  const { from, to } = dayRange(ctx.now);
  const [people, visits] = await Promise.all([
    ctx.ports.repo.caregivers(ctx.agencyId),
    ctx.ports.repo.visits(ctx.agencyId, { from, to }),
  ]);
  const s = await suggestionsFor(ctx, people, visits);
  await ctx.ports.audit.append({ agencyId: ctx.agencyId, userId: ctx.userId, action: "suggestions.compute", entity: "schedule" });
  return { count: s.count, hoursSaved: s.hoursSaved, shiftsFilled: s.shiftsFilled, items: s.items };
}

/** Applies freshly computed suggestions only; the client chooses which visits, never which caregiver. */
export async function applySuggestions(ctx: Ctx, visitIds?: string[]) {
  const { from, to } = dayRange(ctx.now);
  const [people, visits] = await Promise.all([
    ctx.ports.repo.caregivers(ctx.agencyId),
    ctx.ports.repo.visits(ctx.agencyId, { from, to }),
  ]);
  const fresh = (await suggestionsFor(ctx, people, visits)).raw;
  const chosen: Suggestion[] = visitIds ? fresh.filter((s) => visitIds.includes(s.visitId)) : fresh;
  if (visitIds && chosen.length !== new Set(visitIds).size) throw new HttpError(409, "stale_suggestions", "Suggestions changed; review them again");
  await ctx.ports.repo.transaction(ctx.agencyId, async (tx) => {
    for (const s of chosen) await tx.assignVisit(ctx.agencyId, s.visitId, s.caregiverId, "scheduled");
  });
  for (const s of chosen) await record(ctx, "suggestion.apply", s.visitId, { kind: s.kind, caregiverId: s.caregiverId });
  return { applied: chosen.length };
}

export async function search(ctx: Ctx, q: string): Promise<SearchHitDto[]> {
  const hits = await ctx.ports.repo.search(ctx.agencyId, q, 8);
  await ctx.ports.audit.append({ agencyId: ctx.agencyId, userId: ctx.userId, action: "search", entity: "search", meta: { length: q.length, hits: hits.length } });
  return hits;
}

export async function createPatient(ctx: Ctx, input: PatientInput) {
  const p = await ctx.ports.repo.createPatient(ctx.agencyId, input);
  await ctx.ports.audit.append({ agencyId: ctx.agencyId, userId: ctx.userId, action: "patient.create", entity: "patient", entityId: p.id });
  await ctx.ports.realtime.publish({ type: "patient.created", agencyId: ctx.agencyId, entityId: p.id });
  return { id: p.id, name: p.name };
}
