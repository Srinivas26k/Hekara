# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, etc.) working on Hekara. Read this first. Details live in `docs/`.

## What this project is

Home health scheduling and operations software handling **PHI** (protected health information). Priorities, in order: **security, portability, low resource use, correctness, then features.**

## Hard rules

1. **Never import a cloud SDK outside `packages/adapters-*`.** Cloudflare, AWS, GCP and Azure code lives only in adapters. App and domain code depend on the interfaces in `packages/ports`.
2. **All PHI fields are encrypted at the application layer** through the `Crypto` port before they reach storage. Never store or log plaintext PHI. Never put PHI in URLs, error messages, analytics or logs.
3. **Every query is scoped by `agencyId`.** No repository method may run without it. Cross-agency access is a bug.
4. **Validate every input with Valibot** at the HTTP boundary. Schemas live in `packages/core` and are shared with the client.
5. **No third-party requests from the browser.** Fonts, icons and avatars are self-hosted. The CSP forbids external origins.
6. **Every read or write of PHI writes an audit entry** through the `Audit` port.
7. **No secrets in the repo.** `.env` is gitignored. Use the `Secrets` port.
8. **Keep it light.** Add a dependency only if it saves substantial code, is actively maintained, and has few transitive dependencies. Prefer platform APIs (`fetch`, WebCrypto, `URL`, `Intl`).
9. **Standards over vendor features.** Use Web-standard `Request`/`Response`, WebCrypto and SQL that works on both targets. Anything platform-specific is an adapter.
10. **Do not weaken security to make a test pass.** Fix the test or ask.

## Repository layout

```
apps/web                 Hono app (runtime-agnostic) + SolidJS client
packages/core            Domain types, Valibot schemas, scheduling logic (pure, no I/O)
packages/ports           Interfaces: Repository, Realtime, Queue, Blob, Crypto, Secrets, Scheduler, Clock, Audit
packages/adapters-cloudflare   Durable Objects (SQLite), Queues, R2, Secrets Store
packages/adapters-node         Postgres, SSE + LISTEN/NOTIFY, filesystem or S3 blob, env secrets
packages/adapters-aws          RDS/Aurora Postgres, SQS, S3, KMS, API Gateway WebSockets
packages/db              Drizzle schemas and migrations (one per dialect, kept in sync by CI)
packages/ui              Shared UI components and design tokens
packages/contract-tests  One test suite every adapter must pass
docs/                    PRD, TRD, architecture, security, portability, ADRs
Assets/                  Design reference image
web/                     Static prototype (source for the live UI; remove once ported)
```

Directories marked adapters beyond Cloudflare and Node are added on demand; the contract tests define what they must do.

## Commands

```sh
pnpm install --frozen-lockfile
pnpm dev                 # local dev server
pnpm typecheck           # must pass
pnpm lint                # must pass
pnpm test                # unit tests
pnpm test:contract       # adapter contract tests (run for every adapter)
pnpm db:generate         # generate migration from schema change
pnpm db:migrate          # apply migrations
pnpm db:seed             # seed demo agency
```

## Conventions

- TypeScript strict mode. No `any` without a comment explaining why.
- Domain logic is pure functions in `packages/core`, tested without I/O.
- Time comes from the `Clock` port so statuses are testable. Visit status (done, in progress, scheduled) is computed from the clock; only `attention`, `open` and `ai_suggestion` are stored.
- Errors returned to clients carry a code and a generic message, never internals.
- Schema change checklist: update both dialect schemas, generate migrations, update the portable export format version, run contract tests.
- Commit small, one concern per commit. Conventional commit messages.

## Definition of done

Typecheck, lint, unit and contract tests pass. New endpoints have Valibot schemas, agency scoping, audit entries and tests for authorization failure. Docs updated if behavior or architecture changed.

## When unsure

Ask before: changing the encryption format, adding a dependency, adding a platform-specific call outside an adapter, or touching auth. Anything that affects data portability needs an entry in `docs/DECISIONS.md`.
