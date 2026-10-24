# Technical Requirements Document

## 1. Principles

1. **Portable by construction.** App code depends on interfaces (ports); platforms are adapters.
2. **Light.** Few dependencies, no heavy frameworks, small memory footprint, scale to zero where the platform allows.
3. **Secure by default.** Encryption everywhere, least privilege, tenant isolation, audit everything.
4. **Standards first.** Web `Request`/`Response`, WebCrypto, SQL, OIDC, WebAuthn, OpenTelemetry.
5. **TypeScript end to end** with types shared between client and server.

## 2. Stack

| Layer           | Choice                                     | Notes                                                                                                           |
| --------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Language        | TypeScript 7 (strict)                      | Shared types in `packages/core`                                                                                 |
| API             | Hono                                       | Runs on Workers, Node, Bun, Deno, AWS Lambda, Azure Functions and GCP Cloud Run through standard fetch handlers |
| Client          | SolidJS + Vite + Tailwind                  | About 7 KB runtime; no virtual DOM                                                                              |
| Validation      | Valibot                                    | Shared client and server schemas                                                                                |
| Data access     | Drizzle ORM                                | One schema per dialect: SQLite (Durable Objects) and Postgres                                                   |
| Auth            | Better Auth                                | Passkeys first, Argon2id fallback, optional TOTP, OIDC/SAML for enterprise                                      |
| Crypto          | WebCrypto AES-256-GCM, envelope encryption | Same API on every runtime                                                                                       |
| Tests           | Vitest                                     | Unit tests plus shared adapter contract tests                                                                   |
| Lint and format | Biome                                      | Single fast tool                                                                                                |
| Package manager | pnpm, frozen lockfile                      |                                                                                                                 |
| Observability   | OpenTelemetry (OTLP export)                | Works with any backend                                                                                          |

## 3. Ports (the portability contract)

All live in `packages/ports`. Each has at least two adapters and is covered by contract tests.

| Port         | Responsibility                                       | Cloudflare adapter                              | Node/Postgres adapter          | AWS adapter                                       |
| ------------ | ---------------------------------------------------- | ----------------------------------------------- | ------------------------------ | ------------------------------------------------- |
| `Repository` | Agency-scoped data access, transactions, migrations  | Durable Object SQLite, one per agency or branch | Postgres via `postgres.js`     | RDS/Aurora Postgres                               |
| `Realtime`   | Publish and subscribe to schedule changes per agency | DO WebSockets with hibernation                  | SSE + Postgres `LISTEN/NOTIFY` | API Gateway WebSockets or AppSync Events          |
| `Queue`      | Async jobs and event stream to the warehouse         | Cloudflare Queues                               | Postgres-backed queue or Redis | SQS                                               |
| `Blob`       | Files, exports, encrypted backups                    | R2                                              | Filesystem or any S3 API       | S3                                                |
| `Crypto`     | Encrypt and decrypt fields, rotate keys              | WebCrypto + Secrets Store                       | WebCrypto + env or Vault       | WebCrypto + KMS                                   |
| `Secrets`    | Read secrets                                         | Secrets Store                                   | env or Docker secrets          | Secrets Manager                                   |
| `Scheduler`  | Cron jobs (backups, status sweeps)                   | Cron Triggers                                   | in-process cron or system cron | EventBridge                                       |
| `Clock`      | Current time (injectable)                            | `Date`                                          | `Date`                         | `Date`                                            |
| `Audit`      | Append-only, hash-chained log                        | In the same shard                               | Postgres table                 | Postgres table (+ optional S3 object lock export) |

Rule: a port method may not expose a platform type in its signature.

## 4. Data model

Multi-tenant by `agencyId`. Sensitive columns are stored as ciphertext envelopes.

| Table               | Key columns                                                                        | Encrypted fields                                        |
| ------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------- |
| care_plans          | id, agencyId, patientId, status, reviewOn                                          | title, instructions, tasks                              |
| credentials         | id, agencyId, caregiverId, kind, issuedOn, expiresOn                               | none (kind and dates only; ID numbers are never stored) |
| agencies            | id, name                                                                           | none                                                    |
| users (Better Auth) | id, email, role, agencyId                                                          | name                                                    |
| caregivers          | id, agencyId, name, weeklyHours, weeklyLimit, onShift, flagged                     | name                                                    |
| patients            | id, agencyId, name, createdAt                                                      | name, DOB, address, notes                               |
| visits              | id, agencyId, caregiverId, patientId, label, startsAt, endsAt, status, requirement | label (contains patient name)                           |
| claims              | id, agencyId, visitId, amountCents, status                                         | none (no PHI beyond the visit link)                     |
| audit_log           | id, agencyId, userId, action, entity, entityId, prevHash, hash, createdAt          | meta                                                    |

Blind indexes (HMAC of a normalized value) support exact-match search on encrypted names without decrypting the table. Prefix and fuzzy search for authorized users decrypt in memory within the agency scope, bounded by pagination.

Visit status: stored `attention`, `open`, `ai_suggestion`. `scheduled`, `in_progress`, `done` are **derived** from `Clock` and visit times.

### Ciphertext envelope (portable)

```
v1.<keyId>.<base64url(iv)>.<base64url(ciphertext+tag)>
```

Self-describing, so ciphertext moves between platforms without re-encryption. Only the **key provider** changes (Secrets Store, KMS, Vault).

### Keys

- One master key per environment, held by the platform's key service.
- Data keys per agency, wrapped by the master key, cached in memory for a short TTL.
- Rotation: new `keyId` for new writes; background re-encryption job for old data.

## 5. API

REST over HTTPS, typed through Hono RPC. JSON only. All routes under `/api`, all require a session except auth routes.

| Method and path                                                                                     | Purpose                                                                                                           | Roles                                                   |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| GET `/api/schedule?date=&view=day\|week&caregiver=`                                                 | Timeline data                                                                                                     | scheduler, admin; caregiver sees own                    |
| GET `/api/overview`                                                                                 | Counts, open shifts, overtime, suggestions, on-shift                                                              | scheduler, admin                                        |
| POST `/api/visits/:id/fill`                                                                         | Assign best caregiver (or `{caregiverId}`)                                                                        | scheduler, admin                                        |
| POST `/api/optimize`                                                                                | Recompute suggestions                                                                                             | scheduler, admin                                        |
| POST `/api/suggestions/apply`                                                                       | Apply one or all                                                                                                  | scheduler, admin                                        |
| GET `/api/search?q=`                                                                                | Search patients, caregivers, claims                                                                               | by role                                                 |
| POST `/api/patients`                                                                                | Create patient                                                                                                    | scheduler, admin                                        |
| GET `/api/events`                                                                                   | Realtime stream (SSE or WebSocket upgrade)                                                                        | authenticated                                           |
| GET `/api/me`                                                                                       | Current user, role and agency                                                                                     | any signed-in user                                      |
| GET `/api/patients?limit&offset`, GET `/api/patients/:id`                                           | Patient list (newest first) and full record                                                                       | admin, scheduler                                        |
| GET `/api/caregivers`                                                                               | Caregiver load, skills, today's visits, next visit                                                                | admin, scheduler                                        |
| GET `/api/claims?status&limit&offset`                                                               | Claims with visit details, per-status counts and allowed next steps                                               | admin, billing                                          |
| POST `/api/claims/:id/status`                                                                       | Move a claim along draft, submitted, paid or denied                                                               | admin, billing                                          |
| `/api/auth/*`                                                                                       | Sign-in, sign-out, passkeys, two-factor, password reset (Better Auth)                                             | public or session, rate limited                         |
| GET `/api/dashboard`                                                                                | Today's visits by status, week chart, attention list, compliance and care plan alerts, admin-only claims snapshot | admin, scheduler                                        |
| GET `/api/visits?date&status&limit&offset`                                                          | One day's visits with caregiver names and status counts                                                           | admin, scheduler                                        |
| GET/POST `/api/care-plans`, GET/PATCH `/api/care-plans/:id`                                         | Encrypted care plans: list, create, read, update                                                                  | admin, scheduler                                        |
| GET `/api/compliance`, POST `/api/compliance/credentials`, DELETE `/api/compliance/credentials/:id` | Caregiver credentials with expiry status; add (admin, scheduler), remove (admin)                                  | admin, scheduler                                        |
| GET `/api/reports?days`, GET `/api/reports/hours.csv?days`                                          | Hours, fill rate, per-day totals, claims by status; CSV export                                                    | admin, scheduler (hours, fill), admin, billing (claims) |
| GET/PUT `/api/settings`                                                                             | Agency name and the read-only security rules                                                                      | admin                                                   |
| GET/POST `/api/admin/users`                                                                         | List users, create an invite                                                                                      | admin                                                   |
| GET `/api/admin/audit`, POST `/api/admin/audit/verify`                                              | Browse the activity log, check chain integrity                                                                    | admin                                                   |
| POST `/api/admin/export` and `/api/admin/import`                                                    | Portable agency export/import                                                                                     | admin                                                   |

Error shape: `{ "error": { "code": "string", "message": "generic text" } }`. No internals.

## 6. Scheduling logic (pure, in `packages/core`)

- **Eligibility:** caregiver has no overlapping visit, meets the requirement, and `weeklyHours + duration <= weeklyLimit`.
- **Ranking for Fill:** fewest projected overtime hours, then lowest current weekly hours, then least travel gap (when location data exists).
- **Overtime watch:** `weeklyHours / weeklyLimit >= 0.9`.
- **Suggestions:** for each open shift, best eligible caregiver; for each caregiver projected over limit, move a scheduled visit to an eligible caregiver. Report hours saved and shifts filled.
- All functions are deterministic given inputs and `Clock`, and fully unit tested.

## 7. Realtime

- Server publishes `{type, agencyId, entityId}` events after each committed write.
- Client keeps one connection, refetches only the affected slice.
- Heartbeat every 25 s; client reconnects with backoff and resyncs on reconnect.
- Cloudflare: WebSocket hibernation, so an idle agency uses no memory or compute.
- Node: one SSE response per tab; `LISTEN/NOTIFY` fans out between processes.

## 8. Security requirements

Summary here; full detail in SECURITY.md.

- TLS 1.3 only, HSTS preload; database connections `verify-full`.
- Field-level AES-256-GCM for PHI.
- Passkeys, Argon2id, `HttpOnly` `Secure` `SameSite=Strict` cookies, rotating short-lived sessions.
- Strict same-origin CSP (no inline script), COOP/COEP, no external origins, `innerHTML` banned in client code.
- Same-origin enforcement on writes (exact `Origin` plus `SameSite=Strict`), per-address and per-account rate limits, body size limits, Valibot on every route, role check on every route.
- Agency scoping enforced in the repository layer, not only in handlers.
- Append-only hash-chained audit log.

## 9. Performance and resource budgets

| Item                    | Budget                                                               |
| ----------------------- | -------------------------------------------------------------------- |
| Client JS (gzipped)     | under 100 KB total                                                   |
| Initial load            | under 1 s on broadband                                               |
| API p95 (schedule day)  | under 150 ms                                                         |
| Self-host server memory | under 128 MB RSS at idle, under 256 MB under load for a small clinic |
| Realtime fan-out        | under 1 s from commit to screen                                      |
| Search                  | under 200 ms                                                         |

CI fails on JS bundle growth over budget.

## 10. Scaling model

| Size         | Topology                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| Small clinic | One agency shard                                                                                                                      |
| Mid-size     | One shard per branch plus an index for search                                                                                         |
| Enterprise   | Shards per agency and branch, pinned to a region; event stream to a warehouse for cross-branch reports; SSO and customer-managed keys |

Cross-branch reads use fan-out (partial aggregates merged) or the warehouse copy. Live operations touch one shard only.

## 11. Testing

| Level       | What                                                                                                                        |
| ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| Unit        | Scheduling logic, crypto envelope, validation schemas                                                                       |
| Contract    | One suite run against every adapter: scoping, transactions, ordering, realtime delivery, encryption round trip, audit chain |
| Integration | API with a real adapter and a seeded agency                                                                                 |
| Security    | Tests for cross-agency access, role checks, plaintext PHI scan of storage and logs                                          |
| Portability | Export from adapter A, import into adapter B, compare checksums                                                             |
| Performance | Bundle size and latency budgets in CI                                                                                       |

## 12. Observability

- OpenTelemetry traces and metrics exported over OTLP to any backend.
- Structured logs with a redaction layer; PHI fields are never logged.
- Health endpoint `/healthz` (no data), readiness checks the repository.

## 13. Backups and recovery

- Scheduled encrypted export to `Blob` (age encryption, key held separately).
- Retention and object lock where the platform supports it.
- Restore is the same code path as import. Restore drills are part of the release checklist.
- Targets: RPO 24 h by default (1 h on request), RTO 4 h.
