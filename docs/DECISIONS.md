# Architecture Decision Records

Format: context, decision, consequences. Add a new record for any change that affects portability, security or the stack.

## ADR-001: Ports and adapters for all platform concerns
**Status:** accepted
**Context:** The product must move between Cloudflare, AWS, GCP, Azure and self-host with no restrictions.
**Decision:** App and domain code depend only on interfaces in `packages/ports`. Platform code lives in `packages/adapters-*`. A lint rule bans cloud SDK imports elsewhere.
**Consequences:** Extra code for each adapter and a contract test suite. In return, a platform change is a bounded task and is verified by tests.

## ADR-002: TypeScript across the whole stack
**Status:** accepted
**Context:** Small team, shared types between client and server, one toolchain.
**Decision:** TypeScript 7 strict everywhere; Hono RPC and shared Valibot schemas keep types aligned.
**Consequences:** One language to hire for and review. Performance-critical work, if ever needed, goes behind a port.

## ADR-003: Hono as the API framework
**Status:** accepted
**Context:** Needs to run on Workers, Node, Lambda, Cloud Run and Azure with minimal memory.
**Decision:** Hono, built on Web-standard `Request` and `Response`.
**Consequences:** Same handlers everywhere; small footprint. Fewer batteries than larger frameworks, so middleware is written in-house where needed.

## ADR-004: SolidJS with Vite for the client
**Status:** accepted
**Context:** Low JS budget (under 100 KB gzipped), frequent fine-grained updates on a live timeline.
**Decision:** SolidJS and Vite with a hand-written stylesheet ported from the design prototype (Tailwind was dropped: the design is a fixed set of tokens and one screen).
**Consequences:** Small runtime and fast updates; smaller ecosystem than React.

## ADR-005: Two data backends behind one Repository port
**Status:** accepted
**Context:** Cloudflare Durable Object SQLite gives strong per-tenant isolation at low cost; Postgres is the universal target for AWS, GCP, Azure and self-host.
**Decision:** Implement `Repository` for both. Keep one Drizzle schema per dialect, in sync by a CI check. Both pass the same contract tests.
**Consequences:** Double the data-layer work; no lock-in. SQL stays in a common subset, and vendor features sit behind repository methods.

## ADR-006: Application-layer field encryption with a portable envelope
**Status:** accepted
**Context:** PHI must stay protected if storage or a backup is exposed, and must move between platforms without re-encryption.
**Decision:** AES-256-GCM per field, envelope `v1.<keyId>.<iv>.<ct+tag>`, keys behind a `Crypto` and `Secrets` port.
**Consequences:** Search on encrypted fields needs blind indexes and bounded in-memory scans. Key custody becomes a deployment concern, documented in PORTABILITY.md.

## ADR-007: Derived visit status
**Status:** accepted
**Context:** Statuses done, in progress and scheduled change with time; storing them invites stale data.
**Decision:** Compute them from the `Clock` port and visit times. Store only `attention`, `open` and `ai_suggestion`.
**Consequences:** Always correct and testable; queries filter on time ranges.

## ADR-008: Realtime through SSE or WebSockets behind a Realtime port
**Status:** accepted
**Context:** Schedule changes must reach all tabs in under a second at low idle cost.
**Decision:** Events are published per agency. Cloudflare uses hibernating WebSockets; Node uses SSE with Postgres `LISTEN/NOTIFY`; AWS uses API Gateway WebSockets.
**Consequences:** Behavior is contract tested; infrastructure differs by platform.

## ADR-009: Sharding by agency and branch, warehouse for cross-shard reports
**Status:** accepted
**Context:** A single database or Durable Object cannot serve very large agencies, and cross-shard transactions are costly.
**Decision:** Live operations touch one shard. Cross-shard reads use fan-out for small aggregates or a de-identified warehouse fed by the event stream.
**Consequences:** Cross-branch numbers can lag by seconds. Claims are created within one shard, then summed.

## ADR-010: Better Auth with passkeys first
**Status:** accepted
**Context:** Phishing is the main account risk; schema scaffolding already includes Better Auth tables.
**Decision:** Better Auth, passkeys default, Argon2id and TOTP fallbacks, OIDC and SAML for enterprise.
**Consequences:** Account recovery needs a careful design; documented in SECURITY.md.

## ADR-011: No third-party requests from the browser
**Status:** accepted
**Context:** External fonts and images leak IP addresses and complicate CSP and HIPAA review.
**Decision:** Self-host Inter, icons and avatars; the CSP allows only same origin.
**Consequences:** The prototype's Google Fonts and randomuser.me links are replaced during the port.

## ADR-012: Portable export format is a first-class feature
**Status:** accepted
**Context:** Moving platforms must be routine, not a project.
**Decision:** A versioned, checksummed, encrypted NDJSON archive with the audit chain preserved, plus `export`, `import` and `verify` commands.
**Consequences:** Schema changes must bump or extend the format version; round-trip tests run in CI.

## ADR-013: Rule-based Copilot first, model-backed later
**Status:** accepted
**Context:** Suggestions must be explainable, cheap and free of PHI leakage.
**Decision:** Start with the deterministic engine in `packages/core`. Add a model only behind a port, with redaction and a signed BAA.
**Consequences:** Lower cost and risk now; model capability is optional later.

## ADR-014: No Trusted Types enforcement
**Status:** accepted
**Context:** Solid compiles JSX to templates that are inserted with `innerHTML`. A CSP with `require-trusted-types-for 'script'` blocks that, and the page renders blank. A permissive `default` policy would satisfy the browser but would also allow any other `innerHTML` sink, so it adds little protection.
**Decision:** Do not enforce Trusted Types. Keep `script-src 'self'` with no inline script, `object-src 'none'`, `base-uri 'none'`, same-origin `connect-src`, and a test that fails if client code uses `innerHTML`, `outerHTML` or `insertAdjacentHTML`.
**Consequences:** Defense in depth against DOM XSS is weaker than with Trusted Types. The main control is that user data is only ever rendered through Solid's text bindings. Revisit if the client moves to a framework without `innerHTML` templates.

## ADR-015: CSRF defence by Origin check and SameSite, without tokens
**Status:** accepted
**Context:** The API is JSON only, cookies are `SameSite=Strict` and `HttpOnly`, and every client is our own SPA on the same origin.
**Decision:** Every state-changing request must carry an `Origin` header equal to the app origin, and `Strict` cookies are never sent cross-site. No CSRF token.
**Consequences:** Simpler client and no token storage. Relies on browsers sending `Origin` on writes, which all current browsers do; requests without it are rejected. Revisit if the API ever serves third-party sites or non-browser clients with cookies.

## ADR-016: Invite-only accounts and an injected password hasher
**Status:** accepted
**Context:** PHI software should not offer open signup, and `node:crypto` provides Argon2id on Node but not on other runtimes.
**Decision:** Self-signup is disabled; admins create accounts and share one-time links. Password hashing is a `PasswordHasher` port: Node uses Argon2id from `node:crypto`; other platforms inject their own (for example WASM) and read the same stored format.
**Consequences:** Onboarding needs an admin until an email service exists. Hashes carry their parameters, so they stay valid across platforms and can be strengthened later.
