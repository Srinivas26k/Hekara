import type { Caregiver, ClaimStatus, Id, StoredStatus, Visit } from "@hekara/core";

/** Ports: the only surface the app may use to reach a platform. No platform types in signatures. */

export interface Clock { now(): Date }

export interface Secrets { get(name: string): Promise<string> }

/** Encrypts and decrypts fields as `v1.<keyId>.<iv>.<ct+tag>` envelopes. */
export interface Crypto {
  encrypt(agencyId: Id, plaintext: string): Promise<string>;
  decrypt(agencyId: Id, envelope: string): Promise<string>;
  /** Deterministic HMAC used for exact-match search on encrypted fields. */
  blindIndex(agencyId: Id, normalized: string): Promise<string>;
}

/** Supplies raw key material; the only part that changes between KMS, Vault, env and so on. */
export interface KeyProvider {
  currentKeyId(): string;
  /** 32-byte data key for an agency under a key id. */
  dataKey(agencyId: Id, keyId: string): Promise<Uint8Array>;
}

export interface PatientInput { name: string; dob?: string; address?: string; notes?: string }
export interface Patient { id: Id; agencyId: Id; name: string; createdAt: Date }

export interface ClaimRow { id: Id; agencyId: Id; visitId: Id | null; amountCents: number; status: ClaimStatus; createdAt: Date }
/** A claim with the visit it bills for (label and start are decrypted). */
export interface ClaimDetail extends ClaimRow { visitLabel: string | null; visitStart: Date | null }
export interface PatientSummary { id: Id; name: string; createdAt: Date }
export interface PatientDetail extends PatientSummary { dob: string | null; address: string | null; notes: string | null }
export interface Page { limit: number; offset: number }

export interface VisitQuery { from: Date; to: Date; caregiverId?: Id }

export interface SearchHit { kind: "patient" | "caregiver" | "claim"; id: Id; title: string; subtitle?: string }

/** Every method is scoped by agencyId. A method without it is a bug. */
export interface Repository {
  agency(agencyId: Id): Promise<{ id: Id; name: string } | null>;
  caregivers(agencyId: Id): Promise<Caregiver[]>;
  visits(agencyId: Id, q: VisitQuery): Promise<Visit[]>;
  visit(agencyId: Id, id: Id): Promise<Visit | null>;
  assignVisit(agencyId: Id, visitId: Id, caregiverId: Id | null, status?: StoredStatus): Promise<Visit>;
  createPatient(agencyId: Id, input: PatientInput): Promise<Patient>;
  countPatientsSince(agencyId: Id, since: Date): Promise<number>;
  claims(agencyId: Id): Promise<ClaimRow[]>;
  /** Newest first. Names are encrypted at rest, so patient lists page by creation time, not alphabetically. */
  patients(agencyId: Id, page: Page): Promise<{ items: PatientSummary[]; total: number }>;
  patient(agencyId: Id, id: Id): Promise<PatientDetail | null>;
  claimsPage(agencyId: Id, q: Page & { status?: ClaimStatus }): Promise<{ items: ClaimDetail[]; total: number }>;
  claimCounts(agencyId: Id): Promise<Record<ClaimStatus, number>>;
  claim(agencyId: Id, id: Id): Promise<ClaimRow | null>;
  setClaimStatus(agencyId: Id, id: Id, status: ClaimStatus): Promise<ClaimRow>;
  search(agencyId: Id, query: string, limit: number): Promise<SearchHit[]>;
  transaction<T>(agencyId: Id, fn: (tx: Repository) => Promise<T>): Promise<T>;
}

export interface AuditEntry { agencyId: Id; userId: string | null; action: string; entity: string; entityId?: string; meta?: Record<string, unknown> }
export interface AuditRecord {
  seq: number; at: Date; userId: string | null; action: string; entity: string; entityId: string | null;
  meta: Record<string, unknown> | null;
}
export interface Audit {
  append(entry: AuditEntry): Promise<void>;
  /** Newest first. `beforeSeq` pages backwards. */
  list(agencyId: Id, opts: { limit: number; beforeSeq?: number }): Promise<AuditRecord[]>;
  /** Recompute the hash chain; returns the first broken index or null when intact. */
  verify(agencyId: Id): Promise<number | null>;
}

export interface AppEvent { type: "visit.updated" | "suggestions.changed" | "patient.created" | "claim.updated"; agencyId: Id; entityId?: Id }
export interface Realtime {
  publish(event: AppEvent): Promise<void>;
  /** Stream events for one agency. Returns an unsubscribe function. */
  subscribe(agencyId: Id, onEvent: (e: AppEvent) => void): Promise<() => void>;
}

export interface Queue<T = unknown> {
  send(topic: string, message: T): Promise<void>;
}

export interface Blob {
  put(key: string, data: Uint8Array): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}

export interface Scheduler {
  /** Register a recurring job by cron expression. */
  every(name: string, cron: string, job: () => Promise<void>): void;
}

export interface Ports {
  clock: Clock;
  secrets: Secrets;
  crypto: Crypto;
  repo: Repository;
  audit: Audit;
  realtime: Realtime;
  queue: Queue;
  blob: Blob;
  scheduler: Scheduler;
}

/** Password hashing. Argon2id via node:crypto on Node; other platforms supply their own (for example WASM). */
export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(input: { hash: string; password: string }): Promise<boolean>;
}
