# Hekara

Scheduling and operations for home health agencies: live schedule timeline, open-shift filling, overtime watch, AI Copilot suggestions, billing and claims. Built to be light on compute and memory, secure by default, and **portable across any cloud or on-prem**.

> Design reference: `Assets/image.png` (the schedule screen). The static prototype in `web/` matches it pixel for pixel and is the starting point for the live UI.

## Documentation

| Doc | Purpose |
|---|---|
| [AGENTS.md](AGENTS.md) | Rules and context for AI coding agents working in this repo |
| [docs/PRD.md](docs/PRD.md) | What we build and why: users, features, success metrics |
| [docs/TRD.md](docs/TRD.md) | How it works: stack, data model, API, realtime, encryption |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Ports and adapters, package layout, request flow |
| [docs/PORTABILITY.md](docs/PORTABILITY.md) | Moving between Cloudflare, AWS, GCP, Azure, Kubernetes, self-host |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Deploying for a small clinic through a large enterprise |
| [docs/SECURITY.md](docs/SECURITY.md) | Threat model, encryption, auth, hardening |
| [docs/HIPAA.md](docs/HIPAA.md) | Safeguard-to-feature mapping and what stays organizational |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Architecture decision records |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Build order and milestones |

## Stack at a glance

TypeScript everywhere. Hono (API), SolidJS + Vite (UI), Drizzle (data), Valibot (validation), Better Auth with passkeys, WebCrypto AES-256-GCM field encryption. Runs on Cloudflare Workers, AWS, GCP, Azure, Kubernetes or a single Docker host through swappable adapters.

## Current status

Working locally on the Node and Postgres adapter: live schedule (day and week), open-shift fill with undo, overtime watch, AI Copilot suggestions, search, add a patient, sign-in with roles, invites, passkeys and authenticator codes, admin activity log. PHI is encrypted per field. The Cloudflare adapter, export/import tooling and the billing, patients and caregivers pages are not built yet; see [docs/ROADMAP.md](docs/ROADMAP.md).

## Quick start

```sh
cp .env.example .env
pnpm keygen                              # paste the two DATA_KEYS lines it prints into .env
openssl rand -base64 48                  # use the output as AUTH_SECRET in .env
docker compose up -d db
pnpm install
pnpm db:migrate
DEMO_PASSWORD='choose-a-long-password' pnpm db:seed
pnpm build && pnpm start                 # http://localhost:3000
```

The seed creates one account per role (`admin@`, `scheduler@`, `caregiver@`, `billing@juniper.test`) with that password. In development, add `?at=10:45` to the URL to freeze the clock for design comparison.

Run all checks with `pnpm typecheck` and `pnpm test` (tests use the database from `docker compose`).

## License

To be decided by the owner before the first public release.
