# Contributing to Hekara

Thank you for helping. Hekara handles health-related data, so we favour small, well-tested changes over big clever ones. This guide gets you from clone to pull request.

## Ways to contribute

- **Report a bug** or **suggest a feature** with an [issue](https://github.com/Srinivas26k/Hekara/issues/new/choose). Never paste real patient or staff data.
- **Improve the docs.** Fixes to unclear wording are always welcome.
- **Pick up an issue** labelled [`good first issue`](https://github.com/Srinivas26k/Hekara/labels/good%20first%20issue) or [`help wanted`](https://github.com/Srinivas26k/Hekara/labels/help%20wanted).
- **Write an adapter** (Cloudflare, AWS, GCP, Azure). The [contract tests](packages/contract-tests) define "done"; see [docs/PORTABILITY.md](docs/PORTABILITY.md).
- **Add tests** where coverage is thin, for example passkey sign-in.
- **Security issues:** please follow [SECURITY.md](SECURITY.md) and do not open a public issue.

Not sure whether an idea fits? Start a thread in [Discussions](https://github.com/Srinivas26k/Hekara/discussions) before writing code.

## Set up

You need Node 24+, pnpm 12 and Docker.

```sh
git clone https://github.com/<you>/Hekara.git && cd Hekara
cp .env.example .env
pnpm install
pnpm keygen                     # paste the DATA_KEYS lines into .env
openssl rand -base64 48         # use as AUTH_SECRET in .env
docker compose up -d db
pnpm db:migrate
DEMO_PASSWORD='choose-a-long-password' pnpm db:seed
pnpm dev                        # API on :3000
pnpm dev:client                 # UI with hot reload on :5173
```

Before you push:

```sh
pnpm format          # Prettier (130 columns); `pnpm format:check` is what CI runs
pnpm typecheck
pnpm knip            # finds unused files, exports and dependencies
pnpm test
```

All four must pass. Tests use the Postgres container from `docker compose`.

Optional: `pnpm demo:avatars` downloads placeholder profile photos for the demo people.

## The rules that matter

These come from [AGENTS.md](AGENTS.md) and are enforced in review:

1. **No cloud SDKs outside `packages/adapters-*`.** App and domain code depend on `packages/ports`.
2. **Patient data is encrypted before it reaches storage,** and never appears in logs, URLs, error messages or audit metadata.
3. **Every query is scoped by `agencyId`.** A query without it is a bug.
4. **Every route validates input with Valibot** and lists the roles allowed. Deny by default.
5. **No third-party requests from the browser.** Fonts, icons and avatars are bundled.
6. **Audit what matters:** reads of full records, writes, exports and account changes.
7. **Keep it light.** Think twice before adding a dependency; prefer platform APIs.
8. **Never weaken a security control to make a test pass.**

New endpoints need tests for success, validation, wrong role and another agency's data. A schema change needs a migration (`pnpm db:generate`) and, once an adapter exists for another database, the matching schema there.

## Pull requests

1. Fork, then branch from `main` (`feat/care-plan-export`, `fix/visit-overlap`).
2. Keep each PR to **one concern**, and each commit small. Use [Conventional Commits](https://www.conventionalcommits.org): `feat(web): ...`, `fix(core): ...`, `docs: ...`, `test: ...`.
3. Update the docs when behaviour changes, and add an entry to [docs/DECISIONS.md](docs/DECISIONS.md) for anything that affects security or portability.
4. Fill in the PR template. Screenshots help for UI changes (synthetic data only).
5. Be patient and kind in review. We aim to respond within a week.

## Licence of contributions

Hekara is licensed under the [AGPL-3.0](LICENSE), and the maintainer also offers commercial licences ([COMMERCIAL.md](COMMERCIAL.md)). So that both can continue, by submitting a contribution you confirm that:

- you wrote it, or have the right to submit it;
- it may be distributed under the AGPL-3.0 as part of Hekara; and
- you grant the maintainer a perpetual, worldwide, non-exclusive, royalty-free licence to also include it in commercial editions of Hekara under other terms.

You keep the copyright in your work. Add `Signed-off-by: Your Name <you@example.com>` to your commits (`git commit -s`) to record this. If your employer owns what you write, please get their permission first.

_(This is a plain-language statement, not legal advice; the maintainer may replace it with a formal contributor agreement later.)_

## Code of conduct

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
