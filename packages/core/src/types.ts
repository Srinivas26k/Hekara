export type Id = string;

/** Statuses stored in the database. */
export type StoredStatus = "scheduled" | "attention" | "open" | "ai_suggestion";
/** Statuses shown in the UI; done/in_progress/scheduled are derived from the clock. */
export type VisitStatus = "done" | "in_progress" | "scheduled" | "attention" | "open" | "ai_suggestion";

export interface Caregiver {
  id: Id;
  agencyId: Id;
  name: string;
  avatarUrl: string | null;
  weeklyHours: number;
  weeklyLimit: number;
  skills: string[];
  onShift: boolean;
  flagged: boolean;
}

export interface Visit {
  id: Id;
  agencyId: Id;
  caregiverId: Id | null;
  patientId: Id | null;
  label: string;
  startsAt: Date;
  endsAt: Date;
  status: StoredStatus;
  requirement: string | null;
}

export type Suggestion =
  | { kind: "fill"; visitId: Id; caregiverId: Id; hoursSaved: 0 }
  | { kind: "move"; visitId: Id; fromCaregiverId: Id; caregiverId: Id; hoursSaved: number };
