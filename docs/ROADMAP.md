# Roadmap

Build order. Each milestone ends with typecheck, lint, tests and docs updated.

## Done

- pnpm monorepo, Postgres 17 in Docker, Drizzle schema and migration `0000`.
- PRD, TRD, architecture, portability, deployment, security, HIPAA and decision docs.

## M1: Foundation (portable core)

- Create `packages/core`, `packages/ports`, `packages/contract-tests`.
- Implement ports and the Node/Postgres adapter first (fastest to run locally).
- Crypto envelope with a `Crypto` port and unit tests.
- Seed script: 62 caregivers, 142 visits, 14 draft claims, 10 new patients, matching the reference screen.
- Lint rule banning cloud SDK imports outside adapters.

## M2: Live schedule (P0 features)

- Hono app: schedule, overview, fill, optimize, apply suggestions, search, add patient.
- Scheduling logic in `core` with full unit tests.
- Realtime port and SSE implementation; timeline updates across tabs.
- SolidJS client replacing the prototype; same-origin fonts and avatars; bundle budget in CI.
- Derived statuses and live "now" marker driven by the `Clock` port.

## M3: Security baseline (mostly done)

Done: Better Auth with roles, invite-only accounts, Argon2id, TOTP and passkey endpoints, rolling and absolute session limits, per-address and per-account limits, strict headers, field encryption, hash-chained audit with viewer and daily check, role and isolation tests. Remaining: manual passkey test, plaintext-PHI scan of storage and logs as an automated test, shared-store rate limiting for multi-instance setups.

- Better Auth with passkeys, roles and agency scoping at the repository layer.
- Strict CSP, headers, CSRF, rate limits, Valibot on every route.
- Field encryption on PHI columns; blind indexes for search.
- Hash-chained audit log and daily verifier.
- Security test suite: cross-agency, role bypass, plaintext PHI scan.

## M4: Cloudflare adapter

- Durable Object SQLite repository, hibernating WebSocket realtime, Queues, R2, Secrets Store, Cron Triggers.
- SQLite Drizzle schema in sync with Postgres (CI check).
- Entire contract suite green on both adapters.
- `deploy/cloudflare/` with Wrangler config, tunnel and WAF rules.

## M5: Portability tooling

- `hekara export`, `import`, `verify` commands and the archive format.
- Round-trip tests Cloudflare to Node and back in CI.
- Key re-wrap tool.
- `deploy/docker/`, `deploy/kubernetes/`.

## M6: Billing, compliance, reports (billing started)

Done: every menu page is real. Overview, Visits, Care Plans, AI Copilot, Compliance (credential tracking), Reports with CSV export, Settings, Team & Permissions, Patients, Caregivers and Billing & Claims, with role-based navigation. Remaining: claim creation from completed visits, claim export formats, caregiver-facing mobile views, the de-identified warehouse and scheduled reports.

- Claims workflow and export.
- Credentials tracking and audit viewer.
- Event stream and de-identified warehouse; first reports.

## M7: Cloud adapters on demand

- AWS adapter (RDS, SQS, S3, KMS, API Gateway WebSockets) with Terraform in `deploy/aws/`.
- GCP and Azure adapters when a customer needs them. The contract suite defines done.

## M8: Enterprise

- SSO (OIDC and SAML), SCIM, hardware-key enforcement.
- Region pinning, customer-managed keys, SIEM log streaming.
- Canary releases and automated rollback.
- Optional model-backed Copilot behind a port with redaction.

## Ongoing

- Weekly dependency audit, quarterly access review, twice-yearly restore drill, yearly migration rehearsal.
