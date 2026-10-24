import * as v from "valibot";
import type { VisitStatus } from "./types";
import type { ClaimStatus } from "./scheduling";
import type { CarePlanStatus, CredentialStatus, ReviewState } from "./compliance";

/** Request schemas, shared by server (validation) and client (types). */
const text = (max: number) => v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(max));
const id = v.pipe(v.string(), v.uuid());

export const PatientInputSchema = v.strictObject({
  name: text(120),
  dob: v.optional(v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/))),
  address: v.optional(text(300)),
  notes: v.optional(text(2000)),
});

export const FillInputSchema = v.strictObject({ caregiverId: v.optional(id) });

export const ApplyInputSchema = v.strictObject({ visitIds: v.optional(v.pipe(v.array(id), v.maxLength(100))) });

export const ScheduleQuerySchema = v.strictObject({
  date: v.optional(v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/))),
  view: v.optional(v.picklist(["day", "week"])),
  caregiver: v.optional(id),
  at: v.optional(v.pipe(v.string(), v.regex(/^\d{2}:\d{2}$/))),
});

export const ROLES = ["admin", "scheduler", "caregiver", "billing"] as const;
export type Role = (typeof ROLES)[number];

export const InviteInputSchema = v.strictObject({
  email: v.pipe(v.string(), v.trim(), v.toLowerCase(), v.email(), v.maxLength(254)),
  name: text(120),
  role: v.picklist(ROLES),
  caregiverId: v.optional(id),
});

const digits = (max: number) => v.pipe(v.string(), v.regex(new RegExp(`^\\d{1,${max}}$`)));
export const PageQuerySchema = v.strictObject({ limit: v.optional(digits(3)), offset: v.optional(digits(7)) });
export const CLAIM_STATUSES = ["draft", "submitted", "paid", "denied"] as const;
export const ClaimsQuerySchema = v.strictObject({
  limit: v.optional(digits(3)),
  offset: v.optional(digits(7)),
  status: v.optional(v.picklist(CLAIM_STATUSES)),
});
export const ClaimStatusInputSchema = v.strictObject({ status: v.picklist(CLAIM_STATUSES) });

const ymd = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}$/));
export const CARE_PLAN_STATUSES = ["active", "paused", "completed"] as const;
export const VisitsQuerySchema = v.strictObject({
  date: v.optional(ymd),
  limit: v.optional(digits(3)),
  offset: v.optional(digits(7)),
  status: v.optional(v.picklist(["done", "in_progress", "scheduled", "attention", "open"])),
  at: v.optional(v.pipe(v.string(), v.regex(/^\d{2}:\d{2}$/))),
});
export const CarePlansQuerySchema = v.strictObject({
  limit: v.optional(digits(3)),
  offset: v.optional(digits(7)),
  status: v.optional(v.picklist(CARE_PLAN_STATUSES)),
  patientId: v.optional(id),
});
const taskList = v.pipe(v.array(text(200)), v.maxLength(30));
export const CarePlanInputSchema = v.strictObject({
  patientId: id,
  title: text(120),
  instructions: v.optional(text(2000)),
  tasks: v.optional(taskList),
  status: v.optional(v.picklist(CARE_PLAN_STATUSES)),
  reviewOn: v.optional(ymd),
});
export const CarePlanPatchSchema = v.strictObject({
  title: v.optional(text(120)),
  instructions: v.optional(v.nullable(text(2000))),
  tasks: v.optional(taskList),
  status: v.optional(v.picklist(CARE_PLAN_STATUSES)),
  reviewOn: v.optional(v.nullable(ymd)),
});
export const CredentialInputSchema = v.strictObject({
  caregiverId: id,
  kind: text(60),
  issuedOn: v.optional(ymd),
  expiresOn: ymd,
});
export const ReportsQuerySchema = v.strictObject({
  days: v.optional(v.picklist(["7", "14", "30"])),
  at: v.optional(v.pipe(v.string(), v.regex(/^\d{2}:\d{2}$/))),
});
export const SettingsInputSchema = v.strictObject({ agencyName: text(120) });

export const SearchQuerySchema = v.strictObject({ q: v.pipe(v.string(), v.trim(), v.minLength(2), v.maxLength(80)) });

/** Response shapes. Dates are ISO strings. */
export interface VisitDto {
  id: string;
  label: string;
  start: string;
  end: string;
  status: VisitStatus;
  requirement: string | null;
}
export interface PersonDto {
  id: string;
  name: string;
  avatarUrl: string | null;
}
export interface RowDto extends PersonDto {
  flagged: boolean;
  visits: VisitDto[];
}

export interface DayScheduleDto {
  view: "day";
  date: string;
  now: string;
  visitCount: number;
  rows: RowDto[];
  open: VisitDto[];
}
export interface WeekScheduleDto {
  view: "week";
  days: string[];
  now: string;
  rows: (PersonDto & { weeklyHours: number; weeklyLimit: number; days: { visits: number; hours: number }[] })[];
}

export interface SuggestionDto {
  kind: "fill" | "move";
  visitId: string;
  label: string;
  start: string;
  end: string;
  caregiverId: string;
  caregiverName: string;
  fromCaregiverName?: string;
  hoursSaved: number;
}
export interface OverviewDto {
  agency: { name: string };
  date: string;
  now: string;
  visitCount: number;
  badges: { patients: number; schedule: number; claims: number };
  onShift: { count: number; total: number; avatars: PersonDto[] };
  openShifts: VisitDto[];
  overtime: (PersonDto & { hours: number; limit: number; ratio: number })[];
  suggestions: { count: number; hoursSaved: number; shiftsFilled: number; items: SuggestionDto[] };
}
export interface SearchHitDto {
  kind: "patient" | "caregiver" | "claim";
  id: string;
  title: string;
  subtitle?: string;
}

export interface MeDto {
  id: string;
  name: string;
  email: string;
  role: Role;
  twoFactorEnabled: boolean;
  agencyId: string;
  agencyName: string;
  avatarUrl: string | null;
}
export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: Role;
  twoFactorEnabled: boolean;
}

export interface AuditDto {
  seq: number;
  at: string;
  userId: string | null;
  userName: string | null;
  action: string;
  entity: string;
  entityId: string | null;
}
export interface AuditVerifyDto {
  ok: boolean;
  brokenAt: number | null;
  checkedAt: string;
}
export const AuditQuerySchema = v.strictObject({
  limit: v.optional(v.pipe(v.string(), v.regex(/^\d{1,3}$/))),
  before: v.optional(v.pipe(v.string(), v.regex(/^\d{1,10}$/))),
});

export interface PatientListDto {
  items: { id: string; name: string; createdAt: string }[];
  total: number;
  limit: number;
  offset: number;
}
export interface PatientDetailDto {
  id: string;
  name: string;
  dob: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
}
export interface CaregiverCardDto {
  id: string;
  name: string;
  avatarUrl: string | null;
  skills: string[];
  weeklyHours: number;
  weeklyLimit: number;
  flagged: boolean;
  todayVisits: number;
  todayHours: number;
  nextVisit: { label: string; start: string } | null;
}
export interface ClaimDto {
  id: string;
  amountCents: number;
  status: ClaimStatus;
  createdAt: string;
  visitLabel: string | null;
  visitStart: string | null;
  next: ClaimStatus[];
}
export interface ClaimListDto {
  items: ClaimDto[];
  total: number;
  counts: Record<ClaimStatus, number>;
  limit: number;
  offset: number;
}

export interface DashboardDto {
  date: string;
  now: string;
  today: { visits: number; byStatus: Record<"done" | "in_progress" | "scheduled" | "attention" | "open", number>; hours: number };
  onShift: { count: number; total: number };
  openShifts: number;
  overtimeRisk: number;
  suggestions: number;
  week: { date: string; visits: number; open: number }[];
  attention: { id: string; label: string; start: string; caregiverName: string | null }[];
  compliance: { expired: number; due30: number };
  carePlans: { overdue: number };
  claims: { draft: number; submitted: number; outstandingCents: number } | null;
}

export interface VisitRowDto {
  id: string;
  label: string;
  start: string;
  end: string;
  status: VisitStatus;
  requirement: string | null;
  caregiverId: string | null;
  caregiverName: string | null;
}
export interface VisitListDto {
  date: string;
  items: VisitRowDto[];
  total: number;
  limit: number;
  offset: number;
  counts: Record<"all" | "done" | "in_progress" | "scheduled" | "attention" | "open", number>;
}

export interface CarePlanSummaryDto {
  id: string;
  patientId: string;
  patientName: string;
  title: string;
  status: CarePlanStatus;
  reviewOn: string | null;
  review: ReviewState;
  taskCount: number;
  updatedAt: string;
}
export interface CarePlanDetailDto extends CarePlanSummaryDto {
  instructions: string | null;
  tasks: string[];
}
export interface CarePlanListDto {
  items: CarePlanSummaryDto[];
  total: number;
  limit: number;
  offset: number;
}

export interface CredentialDto {
  id: string;
  caregiverId: string;
  caregiverName: string;
  kind: string;
  issuedOn: string | null;
  expiresOn: string;
  status: CredentialStatus;
  daysLeft: number;
}
export interface ComplianceDto {
  today: string;
  items: CredentialDto[];
  counts: Record<CredentialStatus, number>;
  caregivers: { id: string; name: string }[];
}

export interface ReportsDto {
  days: number;
  from: string;
  to: string;
  hours:
    | {
        id: string;
        name: string;
        scheduledHours: number;
        visits: number;
        weeklyHours: number;
        weeklyLimit: number;
        overtimeRisk: boolean;
      }[]
    | null;
  fill: { total: number; filled: number; open: number; rate: number } | null;
  perDay: { date: string; visits: number; hours: number }[] | null;
  claims: { counts: Record<ClaimStatus, number>; amountCents: Record<ClaimStatus, number> } | null;
}
export interface SettingsDto {
  agencyName: string;
  sessionIdleMinutes: number;
  sessionMaxHours: number;
  passwordMinLength: number;
}
