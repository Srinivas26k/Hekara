ALTER TABLE "audit_log" ADD COLUMN "prev_hash" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "hash" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "caregivers" ADD COLUMN "name_idx" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "caregivers" ADD COLUMN "skills" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "name_idx" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "dob" text;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "notes" text;--> statement-breakpoint
CREATE UNIQUE INDEX "audit_agency_seq_idx" ON "audit_log" USING btree ("agency_id","seq");--> statement-breakpoint
CREATE INDEX "patients_agency_created_idx" ON "patients" USING btree ("agency_id","created_at");--> statement-breakpoint
CREATE INDEX "visits_caregiver_start_idx" ON "visits" USING btree ("caregiver_id","starts_at");