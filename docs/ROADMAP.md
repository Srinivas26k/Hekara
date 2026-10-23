# Roadmap

Build order. Each milestone ends with typecheck, lint, tests and docs updated.

## Done

- pnpm monorepo, Postgres 17 in Docker, Drizzle schema and migration `0000`.
- Static UI prototype matching `Assets/image.png`.
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

## M3: Security baseline

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

## M6: Billing, compliance, reports

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
