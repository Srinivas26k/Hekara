## What and why

<!-- One concern per PR. Link the issue: Fixes #123 -->

## How I tested it

<!-- Commands run, screenshots (synthetic data only) -->

## Checklist

- [ ] `pnpm typecheck` and `pnpm test` pass
- [ ] New or changed endpoints validate input, list the allowed roles, and have tests for success, validation, wrong role and another agency's data
- [ ] No patient data in logs, URLs, error messages, audit metadata, screenshots or test fixtures
- [ ] No cloud SDK imported outside `packages/adapters-*`
- [ ] Docs updated (and an entry in `docs/DECISIONS.md` if security or portability is affected)
- [ ] Commits are small, use Conventional Commits, and are signed off (`git commit -s`)
