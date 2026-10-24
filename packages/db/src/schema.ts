import { relations } from "drizzle-orm";
import { boolean, date, integer, pgEnum, pgTable, text, timestamp, uuid, real, index, uniqueIndex } from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["admin", "scheduler", "caregiver", "billing"]);
export const visitStatusEnum = pgEnum("visit_status", ["scheduled", "in_progress", "done", "attention", "open", "ai_suggestion"]);
export const carePlanStatusEnum = pgEnum("care_plan_status", ["active", "paused", "completed"]);
export const claimStatusEnum = pgEnum("claim_status", ["draft", "submitted", "paid", "denied"]);

/* ---------- Better Auth tables ---------- */
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: roleEnum("role").notNull().default("scheduler"),
  agencyId: uuid("agency_id"),
  /** Set for caregiver accounts: limits them to their own visits. */
  caregiverId: uuid("caregiver_id"),
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    /** Encrypted by Better Auth. */
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: boolean("verified").notNull().default(true),
    failedVerificationCount: integer("failed_verification_count").notNull().default(0),
    lockedUntil: timestamp("locked_until"),
  },
  (t) => [index("two_factor_user_idx").on(t.userId)],
);

export const passkey = pgTable(
  "passkey",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull().unique(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    transports: text("transports"),
    aaguid: text("aaguid"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (t) => [index("passkey_user_idx").on(t.userId)],
);

/* ---------- Domain ---------- */
export const agencies = pgTable("agencies", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const caregivers = pgTable("caregivers", {
  id: uuid("id").primaryKey().defaultRandom(),
  agencyId: uuid("agency_id")
    .notNull()
    .references(() => agencies.id, { onDelete: "cascade" }),
  /** Encrypted envelope (v1.<keyId>.<iv>.<ct>). */
  name: text("name").notNull(),
  /** HMAC blind index of the normalized name, for exact-match search. */
  nameIdx: text("name_idx").notNull().default(""),
  avatarUrl: text("avatar_url"),
  skills: text("skills").array().notNull().default([]),
  weeklyHours: real("weekly_hours").notNull().default(0),
  weeklyLimit: real("weekly_limit").notNull().default(40),
  onShift: boolean("on_shift").notNull().default(false),
  flagged: boolean("flagged").notNull().default(false),
  /** Stable display order: the order caregivers were added. */
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const patients = pgTable(
  "patients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    /** name, dob, address and notes are encrypted envelopes. */
    name: text("name").notNull(),
    nameIdx: text("name_idx").notNull().default(""),
    dob: text("dob"),
    address: text("address"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("patients_agency_created_idx").on(t.agencyId, t.createdAt)],
);

export const visits = pgTable(
  "visits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    caregiverId: uuid("caregiver_id").references(() => caregivers.id, { onDelete: "set null" }),
    patientId: uuid("patient_id").references(() => patients.id, { onDelete: "set null" }),
    /** Encrypted envelope: the label contains a patient name. */
    label: text("label").notNull(),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    status: visitStatusEnum("status").notNull().default("scheduled"),
    requirement: text("requirement"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("visits_agency_start_idx").on(t.agencyId, t.startsAt),
    index("visits_caregiver_start_idx").on(t.caregiverId, t.startsAt),
  ],
);

export const carePlans = pgTable(
  "care_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    /** title, instructions and tasks (a JSON array) are encrypted envelopes. */
    title: text("title").notNull(),
    instructions: text("instructions"),
    tasks: text("tasks"),
    status: carePlanStatusEnum("status").notNull().default("active"),
    reviewOn: date("review_on", { mode: "string" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("care_plans_agency_patient_idx").on(t.agencyId, t.patientId)],
);

/** Caregiver credentials (CPR, TB test, background check). Kind and dates only: no ID numbers are stored. */
export const credentials = pgTable(
  "credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id")
      .notNull()
      .references(() => agencies.id, { onDelete: "cascade" }),
    caregiverId: uuid("caregiver_id")
      .notNull()
      .references(() => caregivers.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    issuedOn: date("issued_on", { mode: "string" }),
    expiresOn: date("expires_on", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("credentials_agency_expiry_idx").on(t.agencyId, t.expiresOn)],
);

export const claims = pgTable("claims", {
  id: uuid("id").primaryKey().defaultRandom(),
  agencyId: uuid("agency_id")
    .notNull()
    .references(() => agencies.id, { onDelete: "cascade" }),
  visitId: uuid("visit_id").references(() => visits.id, { onDelete: "set null" }),
  amountCents: integer("amount_cents").notNull(),
  status: claimStatusEnum("status").notNull().default("draft"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agencyId: uuid("agency_id"),
    userId: text("user_id"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    /** Encrypted JSON envelope. */
    meta: text("meta"),
    /** hash = SHA-256(prevHash || canonical entry); prevHash is "" for the first entry of an agency. */
    prevHash: text("prev_hash").notNull().default(""),
    hash: text("hash").notNull().default(""),
    seq: integer("seq").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("audit_agency_seq_idx").on(t.agencyId, t.seq)],
);

export const visitRelations = relations(visits, ({ one }) => ({
  caregiver: one(caregivers, { fields: [visits.caregiverId], references: [caregivers.id] }),
  patient: one(patients, { fields: [visits.patientId], references: [patients.id] }),
}));
