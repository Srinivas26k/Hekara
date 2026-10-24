# Architecture

Hekara uses **ports and adapters** (hexagonal architecture). The domain and HTTP layers know nothing about where they run. Platforms plug in through adapters.

```
                +-------------------------------+
   Browser ---> |  apps/web  (Hono + Solid UI)  |
                |  routes, auth, validation     |
                +---------------+---------------+
                                |
                        packages/core
                  (domain types, scheduling logic)
                                |
                        packages/ports
        Repository  Realtime  Queue  Blob  Crypto  Secrets  Scheduler  Clock  Audit
                                |
        +-----------+-----------+-----------+-----------+
        |           |           |           |           |
   adapters-    adapters-    adapters-   adapters-   adapters-
   cloudflare     node         aws         gcp        azure
   (DO SQLite)  (Postgres)   (RDS,SQS)   (Cloud SQL)  (Azure DB)
```

## Package responsibilities

| Package          | Contains                                      | May import                     |
| ---------------- | --------------------------------------------- | ------------------------------ |
| `core`           | Types, Valibot schemas, pure scheduling logic | nothing platform-specific      |
| `ports`          | TypeScript interfaces only                    | `core` types                   |
| `apps/web`       | Hono routes, middleware, Solid client         | `core`, `ports`                |
| `adapters-*`     | Platform code implementing ports              | `core`, `ports`, platform SDKs |
| `db`             | Drizzle schemas per dialect, migrations       | `drizzle-orm`                  |
| `contract-tests` | Tests that run against any adapter            | `ports`                        |

Dependency rule: arrows point inward. `core` imports nothing from other packages. Only adapters import cloud SDKs. A lint rule enforces this.

## Composition root

Each deployable has one small entry file that builds the adapters and hands them to the app:

```ts
// entries/cloudflare.ts
export default createApp({ repo: cfRepo(env), realtime: cfRealtime(env), crypto: webCrypto(cfKeys(env)) /* ... */ });

// entries/node.ts
serve(createApp({ repo: pgRepo(url), realtime: sseRealtime(pg), crypto: webCrypto(envKeys()) /* ... */ }));
```

`createApp(deps)` is the same function everywhere. Moving platforms means changing the entry file and infrastructure config, not the app.

## Request flow (Fill an open shift)

1. Client sends `POST /api/visits/:id/fill` with a session cookie.
2. Middleware: security headers, rate limit, session check, role check, Valibot validation.
3. Handler loads candidates through `Repository` (scoped by `agencyId`), decrypts only needed fields through `Crypto`.
4. `core` ranks eligible caregivers; handler writes the assignment in one transaction.
5. `Audit` appends a hash-chained entry.
6. `Realtime` publishes `visit.updated` for the agency.
7. Every open tab receives the event and refetches the affected rows.

## Sharding

- A **shard** is one `Repository` instance holding one agency or branch.
- A `ShardRouter` maps `(agencyId, branchId)` to a shard handle. Small clinics have one shard; the router is a no-op.
- Cross-shard reads use `fanOut(shards, partialQuery)` and merge in `core`.
- Heavy analytics read the warehouse copy fed by the `Queue` event stream.

## Data flow for reports

```
Shard writes -> Queue (event stream) -> Consumer -> Warehouse (Postgres/ClickHouse, de-identified) -> Reports
```

De-identification happens in the consumer: names and free text are dropped; ids are pseudonymized per tenant.

## Frontend

- SolidJS signals map directly to the timeline rows; an event updates only the changed visit block.
- The design tokens (colors, radii, fonts) come from the prototype CSS and live in `packages/ui`.
- The "now" marker and statuses are driven by a client clock tick every 30 s plus server events.
- All assets are same-origin.

## Where things must not go

| Don't                           | Do instead                    |
| ------------------------------- | ----------------------------- |
| Call `env.MY_BUCKET` in a route | Call `blob.put()`             |
| Use `pg` types in `core`        | Return plain domain objects   |
| Read `process.env` in handlers  | Use the `Secrets` port        |
| Log a patient name              | Log ids only                  |
| Query without `agencyId`        | Use scoped repository methods |
