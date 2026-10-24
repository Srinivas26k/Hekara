import type {
  AuditDto,
  AuditVerifyDto,
  CarePlanDetailDto,
  CarePlanListDto,
  CarePlanStatus,
  CaregiverCardDto,
  ComplianceDto,
  CredentialDto,
  DashboardDto,
  ReportsDto,
  SettingsDto,
  VisitListDto,
  VisitStatus,
  ClaimListDto,
  ClaimStatus,
  MeDto,
  PatientDetailDto,
  PatientListDto,
  UserDto,
  Role,
  DayScheduleDto,
  OverviewDto,
  SearchHitDto,
  SuggestionDto,
  VisitDto,
  WeekScheduleDto,
  PersonDto,
} from "@hekara/core";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!r.ok) {
    const e = (await r.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(r.status, e?.error?.code ?? "error", e?.error?.message ?? "Request failed");
  }
  return r.json() as Promise<T>;
}

async function remove(path: string): Promise<void> {
  const r = await fetch(`/api${path}`, { method: "DELETE", credentials: "same-origin" });
  if (!r.ok) {
    const e = (await r.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
    throw new ApiError(r.status, e?.error?.code ?? "error", e?.error?.message ?? "Request failed");
  }
}
const put = <T>(path: string, body: unknown) => call<T>(path, { method: "PUT", body: JSON.stringify(body) });
const patch = <T>(path: string, body: unknown) => call<T>(path, { method: "PATCH", body: JSON.stringify(body) });

const qs = (o: Record<string, string | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
};
/** Dev only: `?at=HH:MM` in the page URL pins the clock for reads and writes alike. The server ignores it in production. */
const pinned = /^\d{2}:\d{2}$/.test(new URLSearchParams(location.search).get("at") ?? "")
  ? new URLSearchParams(location.search).get("at")!
  : undefined;
const post = <T>(path: string, body?: unknown) =>
  call<T>(`${path}${pinned ? `?at=${pinned}` : ""}`, {
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });

export const api = {
  me: () => call<MeDto>("/me"),
  dashboard: (at?: string) => call<DashboardDto>(`/dashboard${qs({ at })}`),
  visits: (o: { date?: string; status?: VisitStatus; offset: number; limit: number; at?: string }) =>
    call<VisitListDto>(
      `/visits${qs({ date: o.date, status: o.status, offset: String(o.offset), limit: String(o.limit), at: o.at })}`,
    ),
  carePlans: (o: { status?: CarePlanStatus; offset: number; limit: number }) =>
    call<CarePlanListDto>(`/care-plans${qs({ status: o.status, offset: String(o.offset), limit: String(o.limit) })}`),
  carePlan: (id: string) => call<CarePlanDetailDto>(`/care-plans/${id}`),
  createCarePlan: (input: {
    patientId: string;
    title: string;
    instructions?: string;
    tasks?: string[];
    status?: CarePlanStatus;
    reviewOn?: string;
  }) => post<CarePlanDetailDto>("/care-plans", input),
  updateCarePlan: (
    id: string,
    input: { title?: string; instructions?: string | null; tasks?: string[]; status?: CarePlanStatus; reviewOn?: string | null },
  ) => patch<CarePlanDetailDto>(`/care-plans/${id}`, input),
  compliance: () => call<ComplianceDto>("/compliance"),
  addCredential: (input: { caregiverId: string; kind: string; issuedOn?: string; expiresOn: string }) =>
    post<CredentialDto>("/compliance/credentials", input),
  removeCredential: (id: string) => remove(`/compliance/credentials/${id}`),
  reports: (days: number, at?: string) => call<ReportsDto>(`/reports${qs({ days: String(days), at })}`),
  settings: () => call<SettingsDto>("/settings"),
  saveSettings: (agencyName: string) => put<SettingsDto>("/settings", { agencyName }),
  patients: (offset: number, limit: number) =>
    call<PatientListDto>(`/patients${qs({ offset: String(offset), limit: String(limit) })}`),
  patient: (id: string) => call<PatientDetailDto>(`/patients/${id}`),
  caregivers: (at?: string) => call<CaregiverCardDto[]>(`/caregivers${qs({ at })}`),
  claims: (status: ClaimStatus | undefined, offset: number, limit: number) =>
    call<ClaimListDto>(`/claims${qs({ status, offset: String(offset), limit: String(limit) })}`),
  setClaimStatus: (id: string, status: ClaimStatus) =>
    post<{ id: string; status: ClaimStatus }>(`/claims/${id}/status`, { status }),
  audit: (before?: number) => call<AuditDto[]>(`/admin/audit${qs({ limit: "30", before: before ? String(before) : undefined })}`),
  verifyAudit: () => post<AuditVerifyDto>("/admin/audit/verify"),
  users: () => call<UserDto[]>("/admin/users"),
  invite: (input: { email: string; name: string; role: Role; caregiverId?: string }) =>
    post<{ userId: string; link: string }>("/admin/users", input),
  overview: (at?: string) => call<OverviewDto>(`/overview${qs({ at })}`),
  schedule: (o: { view: "day" | "week"; caregiver?: string; at?: string }) =>
    call<DayScheduleDto | WeekScheduleDto>(`/schedule${qs(o)}`),
  fill: (id: string, caregiverId?: string) =>
    post<{ visit: VisitDto; caregiver: PersonDto }>(`/visits/${id}/fill`, { caregiverId }),
  unfill: (id: string) => post<VisitDto>(`/visits/${id}/unfill`),
  optimize: () => post<{ count: number; hoursSaved: number; shiftsFilled: number; items: SuggestionDto[] }>("/optimize"),
  apply: (visitIds?: string[]) => post<{ applied: number }>("/suggestions/apply", { visitIds }),
  search: (q: string) => call<SearchHitDto[]>(`/search${qs({ q })}`),
  createPatient: (input: { name: string; dob?: string; address?: string; notes?: string }) =>
    post<{ id: string; name: string }>("/patients", input),
};
