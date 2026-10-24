import {
  credentialStatus,
  daysUntil,
  deriveStatus,
  overtimeWatch,
  reviewState,
  visitHours,
  ymdOf,
  type CarePlanDetailDto,
  type CarePlanListDto,
  type CarePlanStatus,
  type ComplianceDto,
  type CredentialDto,
  type DashboardDto,
  type ReportsDto,
  type Role,
  type SettingsDto,
  type VisitListDto,
  type VisitStatus,
} from "@hekara/core";
import type { CarePlanDetail, CarePlanInput, CarePlanPatch, CarePlanSummary, CredentialInput } from "@hekara/ports";
import { buildSuggestions } from "@hekara/core";
import { HttpError } from "./errors";
import { ABSOLUTE_MS, IDLE_SECONDS, MIN_PASSWORD_LENGTH } from "./policy";
import { auditRead, dayRange, type Ctx } from "./services";

const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const clampPage = (limit?: number, offset?: number) => ({
  limit: Math.min(Math.max(limit ?? 25, 1), 100),
  offset: Math.max(offset ?? 0, 0),
});
const round1 = (n: number) => Math.round(n * 10) / 10;

/* ---------------------------------- dashboard --------------------------------- */

export async function dashboard(ctx: Ctx, role: Role): Promise<DashboardDto> {
  const { from, to, date } = dayRange(ctx.now);
  const monday = addDays(from, -((from.getDay() + 6) % 7));
  const today = date;
  const [people, weekVisits, overdue, creds, totals] = await Promise.all([
    ctx.ports.repo.caregivers(ctx.agencyId),
    ctx.ports.repo.visits(ctx.agencyId, { from: monday, to: addDays(monday, 7) }),
    ctx.ports.repo.carePlans(ctx.agencyId, { status: "active", reviewBefore: today, limit: 1, offset: 0 }),
    ctx.ports.repo.credentials(ctx.agencyId),
    role === "admin" ? ctx.ports.repo.claimTotals(ctx.agencyId) : Promise.resolve(null),
  ]);
  const visits = weekVisits.filter((v) => v.startsAt >= from && v.startsAt < to);
  const names = new Map(people.map((c) => [c.id, c.name]));
  const byStatus = { done: 0, in_progress: 0, scheduled: 0, attention: 0, open: 0 };
  for (const v of visits) {
    const st = deriveStatus(v, ctx.now);
    if (st in byStatus) byStatus[st as keyof typeof byStatus]++;
  }
  const active = new Set(
    visits.filter((v) => v.caregiverId && v.startsAt <= ctx.now && ctx.now < v.endsAt).map((v) => v.caregiverId!),
  );
  await auditRead(ctx, "dashboard.read", today, "dashboard");
  return {
    date,
    now: ctx.now.toISOString(),
    today: { visits: visits.length, byStatus, hours: round1(visits.reduce((n, v) => n + visitHours(v), 0)) },
    onShift: { count: active.size, total: people.length },
    openShifts: byStatus.open,
    overtimeRisk: overtimeWatch(people).length,
    suggestions: buildSuggestions(
      people,
      visits.filter((v) => v.endsAt > ctx.now),
    ).length,
    week: Array.from({ length: 7 }, (_, i) => {
      const day = addDays(monday, i),
        next = addDays(day, 1);
      const mine = weekVisits.filter((v) => v.startsAt >= day && v.startsAt < next);
      return { date: ymdOf(day), visits: mine.length, open: mine.filter((v) => !v.caregiverId).length };
    }),
    attention: visits
      .filter((v) => v.status === "attention")
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      .slice(0, 5)
      .map((v) => ({
        id: v.id,
        label: v.label,
        start: v.startsAt.toISOString(),
        caregiverName: v.caregiverId ? (names.get(v.caregiverId) ?? null) : null,
      })),
    compliance: {
      expired: creds.filter((c) => credentialStatus(c.expiresOn, today) === "expired").length,
      due30: creds.filter((c) => credentialStatus(c.expiresOn, today) === "due30").length,
    },
    carePlans: { overdue: overdue.total },
    claims: totals
      ? {
          draft: totals.counts.draft,
          submitted: totals.counts.submitted,
          outstandingCents: totals.amountCents.draft + totals.amountCents.submitted,
        }
      : null,
  };
}

/* ------------------------------------ visits ---------------------------------- */

export async function visitsList(
  ctx: Ctx,
  q: { date?: string; status?: VisitStatus; limit?: number; offset?: number },
): Promise<VisitListDto> {
  const { from, to, date } = dayRange(ctx.now, q.date);
  const page = clampPage(q.limit, q.offset);
  const [people, visits] = await Promise.all([
    ctx.ports.repo.caregivers(ctx.agencyId),
    ctx.ports.repo.visits(ctx.agencyId, { from, to }),
  ]);
  const names = new Map(people.map((c) => [c.id, c.name]));
  const rows = visits.map((v) => ({ v, status: deriveStatus(v, ctx.now) }));
  const counts = { all: rows.length, done: 0, in_progress: 0, scheduled: 0, attention: 0, open: 0 };
  for (const r of rows) if (r.status in counts) counts[r.status as keyof typeof counts]++;
  const shown = rows.filter((r) => !q.status || r.status === q.status);
  await auditRead(ctx, "visit.list", `${date}:${q.status ?? "all"}`, "visit");
  return {
    date,
    counts,
    total: shown.length,
    ...page,
    items: shown.slice(page.offset, page.offset + page.limit).map(({ v, status }) => ({
      id: v.id,
      label: v.label,
      start: v.startsAt.toISOString(),
      end: v.endsAt.toISOString(),
      status,
      requirement: v.requirement,
      caregiverId: v.caregiverId,
      caregiverName: v.caregiverId ? (names.get(v.caregiverId) ?? null) : null,
    })),
  };
}

/* --------------------------------- care plans --------------------------------- */

const today = (ctx: Ctx) => ymdOf(ctx.now);
const planSummary = (ctx: Ctx, p: CarePlanSummary) => ({
  id: p.id,
  patientId: p.patientId,
  patientName: p.patientName,
  title: p.title,
  status: p.status,
  reviewOn: p.reviewOn,
  review: reviewState(p.reviewOn, today(ctx), p.status),
  taskCount: p.taskCount,
  updatedAt: p.updatedAt.toISOString(),
});
const planDetail = (ctx: Ctx, p: CarePlanDetail): CarePlanDetailDto => ({
  ...planSummary(ctx, p),
  instructions: p.instructions,
  tasks: p.tasks,
});

export async function carePlansList(
  ctx: Ctx,
  q: { status?: CarePlanStatus; patientId?: string; limit?: number; offset?: number },
): Promise<CarePlanListDto> {
  const page = clampPage(q.limit, q.offset);
  const r = await ctx.ports.repo.carePlans(ctx.agencyId, { ...page, status: q.status, patientId: q.patientId });
  await auditRead(ctx, "careplan.list", `${q.status ?? "all"}:${page.offset}`, "careplan");
  return { items: r.items.map((p) => planSummary(ctx, p)), total: r.total, ...page };
}

export async function carePlanGet(ctx: Ctx, id: string): Promise<CarePlanDetailDto> {
  const p = await ctx.ports.repo.carePlan(ctx.agencyId, id);
  if (!p) throw new HttpError(404, "not_found", "Not found");
  await auditRead(ctx, "careplan.read", id, "careplan");
  return planDetail(ctx, p);
}

export async function carePlanCreate(ctx: Ctx, input: CarePlanInput): Promise<CarePlanDetailDto> {
  let p: CarePlanDetail;
  try {
    p = await ctx.ports.repo.createCarePlan(ctx.agencyId, input);
  } catch {
    throw new HttpError(404, "not_found", "Not found");
  }
  await ctx.ports.audit.append({
    agencyId: ctx.agencyId,
    userId: ctx.userId,
    action: "careplan.create",
    entity: "careplan",
    entityId: p.id,
  });
  await ctx.ports.realtime.publish({ type: "careplan.updated", agencyId: ctx.agencyId, entityId: p.id });
  return planDetail(ctx, p);
}

export async function carePlanUpdate(ctx: Ctx, id: string, patch: CarePlanPatch): Promise<CarePlanDetailDto> {
  let p: CarePlanDetail;
  try {
    p = await ctx.ports.repo.updateCarePlan(ctx.agencyId, id, patch);
  } catch {
    throw new HttpError(404, "not_found", "Not found");
  }
  await ctx.ports.audit.append({
    agencyId: ctx.agencyId,
    userId: ctx.userId,
    action: "careplan.update",
    entity: "careplan",
    entityId: id,
    meta: { fields: Object.keys(patch) },
  });
  await ctx.ports.realtime.publish({ type: "careplan.updated", agencyId: ctx.agencyId, entityId: id });
  return planDetail(ctx, p);
}

/* --------------------------------- compliance --------------------------------- */

const credDto = (
  c: { id: string; caregiverId: string; caregiverName: string; kind: string; issuedOn: string | null; expiresOn: string },
  t: string,
): CredentialDto => ({ ...c, status: credentialStatus(c.expiresOn, t), daysLeft: daysUntil(c.expiresOn, t) });

export async function compliance(ctx: Ctx): Promise<ComplianceDto> {
  const t = today(ctx);
  const [creds, people] = await Promise.all([ctx.ports.repo.credentials(ctx.agencyId), ctx.ports.repo.caregivers(ctx.agencyId)]);
  const items = creds.map((c) => credDto(c, t));
  const counts = { expired: 0, due30: 0, due90: 0, valid: 0 };
  for (const i of items) counts[i.status]++;
  await auditRead(ctx, "compliance.read", t, "compliance");
  return { today: t, items, counts, caregivers: people.map((c) => ({ id: c.id, name: c.name })) };
}

export async function credentialAdd(ctx: Ctx, input: CredentialInput): Promise<CredentialDto> {
  if (input.issuedOn && input.issuedOn > input.expiresOn) throw new HttpError(400, "invalid_request", "Invalid request");
  let c;
  try {
    c = await ctx.ports.repo.addCredential(ctx.agencyId, input);
  } catch {
    throw new HttpError(404, "not_found", "Not found");
  }
  await ctx.ports.audit.append({
    agencyId: ctx.agencyId,
    userId: ctx.userId,
    action: "credential.add",
    entity: "credential",
    entityId: c.id,
    meta: { kind: c.kind },
  });
  await ctx.ports.realtime.publish({ type: "credential.updated", agencyId: ctx.agencyId, entityId: c.id });
  return credDto(c, today(ctx));
}

export async function credentialRemove(ctx: Ctx, id: string): Promise<void> {
  if (!(await ctx.ports.repo.removeCredential(ctx.agencyId, id))) throw new HttpError(404, "not_found", "Not found");
  await ctx.ports.audit.append({
    agencyId: ctx.agencyId,
    userId: ctx.userId,
    action: "credential.remove",
    entity: "credential",
    entityId: id,
  });
  await ctx.ports.realtime.publish({ type: "credential.updated", agencyId: ctx.agencyId, entityId: id });
}

/* ------------------------------------ reports --------------------------------- */

export async function reports(ctx: Ctx, role: Role, days: number): Promise<ReportsDto> {
  const { from: todayStart, date } = dayRange(ctx.now);
  const from = addDays(todayStart, -(days - 1)),
    to = addDays(todayStart, 1);
  const staff = role === "admin" || role === "scheduler";
  const [people, visits, totals] = await Promise.all([
    staff ? ctx.ports.repo.caregivers(ctx.agencyId) : Promise.resolve([]),
    staff ? ctx.ports.repo.visits(ctx.agencyId, { from, to }) : Promise.resolve([]),
    role === "admin" || role === "billing" ? ctx.ports.repo.claimTotals(ctx.agencyId) : Promise.resolve(null),
  ]);
  await auditRead(ctx, "report.read", `${days}d:${date}`, "report");
  const base = { days, from: ymdOf(from), to: date };
  if (!staff) return { ...base, hours: null, fill: null, perDay: null, claims: totals };
  const assigned = visits.filter((v) => v.caregiverId);
  return {
    ...base,
    hours: people
      .map((c) => {
        const mine = assigned.filter((v) => v.caregiverId === c.id);
        return {
          id: c.id,
          name: c.name,
          visits: mine.length,
          scheduledHours: round1(mine.reduce((n, v) => n + visitHours(v), 0)),
          weeklyHours: c.weeklyHours,
          weeklyLimit: c.weeklyLimit,
          overtimeRisk: c.weeklyHours / c.weeklyLimit >= 0.9,
        };
      })
      .sort((a, b) => b.scheduledHours - a.scheduledHours || a.name.localeCompare(b.name)),
    fill: {
      total: visits.length,
      filled: assigned.length,
      open: visits.length - assigned.length,
      rate: visits.length ? Math.round((assigned.length / visits.length) * 1000) / 10 : 100,
    },
    perDay: Array.from({ length: days }, (_, i) => {
      const day = addDays(from, i),
        next = addDays(day, 1);
      const mine = visits.filter((v) => v.startsAt >= day && v.startsAt < next);
      return { date: ymdOf(day), visits: mine.length, hours: round1(mine.reduce((n, v) => n + visitHours(v), 0)) };
    }),
    claims: totals,
  };
}

/** Spreadsheet formulas can run when a CSV is opened, so cells that start like one are defused. */
export const csvCell = (v: string | number): string => {
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function hoursCsv(ctx: Ctx, days: number): Promise<string> {
  const r = await reports(ctx, "admin", days);
  const head = ["Caregiver", "Visits", "Scheduled hours", "Weekly hours so far", "Weekly limit", "Overtime risk"];
  const lines = [
    head,
    ...(r.hours ?? []).map((h) => [
      h.name,
      h.visits,
      h.scheduledHours,
      h.weeklyHours,
      h.weeklyLimit,
      h.overtimeRisk ? "yes" : "no",
    ]),
  ];
  await ctx.ports.audit.append({
    agencyId: ctx.agencyId,
    userId: ctx.userId,
    action: "report.export",
    entity: "report",
    meta: { days, rows: lines.length - 1 },
  });
  return lines.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

/* ------------------------------------ settings -------------------------------- */

export async function settingsGet(ctx: Ctx): Promise<SettingsDto> {
  const a = await ctx.ports.repo.agency(ctx.agencyId);
  return {
    agencyName: a?.name ?? "",
    sessionIdleMinutes: IDLE_SECONDS / 60,
    sessionMaxHours: ABSOLUTE_MS / 3_600_000,
    passwordMinLength: MIN_PASSWORD_LENGTH,
  };
}

export async function settingsSet(ctx: Ctx, agencyName: string): Promise<SettingsDto> {
  await ctx.ports.repo.renameAgency(ctx.agencyId, agencyName);
  await ctx.ports.audit.append({
    agencyId: ctx.agencyId,
    userId: ctx.userId,
    action: "settings.update",
    entity: "settings",
    meta: { fields: ["agencyName"] },
  });
  return settingsGet(ctx);
}
