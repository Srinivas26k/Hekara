import * as v from "valibot";
import type { VisitStatus } from "./types";

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

export const SearchQuerySchema = v.strictObject({ q: v.pipe(v.string(), v.trim(), v.minLength(2), v.maxLength(80)) });

/** Response shapes. Dates are ISO strings. */
export interface VisitDto { id: string; label: string; start: string; end: string; status: VisitStatus; requirement: string | null }
export interface PersonDto { id: string; name: string; avatarUrl: string | null }
export interface RowDto extends PersonDto { flagged: boolean; visits: VisitDto[] }

export interface DayScheduleDto {
  view: "day"; date: string; now: string; visitCount: number;
  rows: RowDto[]; open: VisitDto[];
}
export interface WeekScheduleDto {
  view: "week"; days: string[]; now: string;
  rows: (PersonDto & { weeklyHours: number; weeklyLimit: number; days: { visits: number; hours: number }[] })[];
}

export interface SuggestionDto {
  kind: "fill" | "move"; visitId: string; label: string; start: string; end: string;
  caregiverId: string; caregiverName: string; fromCaregiverName?: string; hoursSaved: number;
}
export interface OverviewDto {
  agency: { name: string };
  date: string; now: string; visitCount: number;
  badges: { patients: number; schedule: number; claims: number };
  onShift: { count: number; total: number; avatars: PersonDto[] };
  openShifts: VisitDto[];
  overtime: (PersonDto & { hours: number; limit: number; ratio: number })[];
  suggestions: { count: number; hoursSaved: number; shiftsFilled: number; items: SuggestionDto[] };
}
export interface SearchHitDto { kind: "patient" | "caregiver" | "claim"; id: string; title: string; subtitle?: string }

export interface MeDto { id: string; name: string; email: string; role: Role; twoFactorEnabled: boolean; agencyId: string; agencyName: string }
export interface UserDto { id: string; name: string; email: string; role: Role; twoFactorEnabled: boolean }

export interface AuditDto { seq: number; at: string; userId: string | null; userName: string | null; action: string; entity: string; entityId: string | null }
export interface AuditVerifyDto { ok: boolean; brokenAt: number | null; checkedAt: string }
export const AuditQuerySchema = v.strictObject({
  limit: v.optional(v.pipe(v.string(), v.regex(/^\d{1,3}$/))),
  before: v.optional(v.pipe(v.string(), v.regex(/^\d{1,10}$/))),
});
