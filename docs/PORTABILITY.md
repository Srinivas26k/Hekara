# Portability and Migration Guide

Goal: **no lock-in**. An agency can move between Cloudflare, AWS, GCP, Azure, Kubernetes or a single Docker host, and between providers of the same kind, in one maintenance window with no data loss.

## 1. What makes this possible

| Mechanism                           | Effect                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------ |
| Ports and adapters                  | Platform code is isolated in `packages/adapters-*`                                               |
| Web-standard runtime APIs           | Hono, `fetch`, WebCrypto and `URL` run on every JS runtime                                       |
| Portable ciphertext envelope        | `v1.<keyId>.<iv>.<ct+tag>` needs no re-encryption when data moves; only the key provider changes |
| Dialect-neutral SQL                 | Schemas for SQLite and Postgres are kept in sync and checked in CI                               |
| Portable export format              | Versioned, platform-neutral archive (below)                                                      |
| Contract tests                      | Every adapter must pass the same suite, so a new platform is verified, not assumed               |
| Infrastructure as code per platform | `deploy/<platform>/` holds the config; none leaks into app code                                  |

## 2. Portable export format

An export is a single archive, encrypted with `age`.

```
hekara-export-v1/
  manifest.json        format version, agency id, counts, per-file SHA-256, created at, source platform
  agency.ndjson        one JSON object per line
  users.ndjson
  caregivers.ndjson
  patients.ndjson
  visits.ndjson
  claims.ndjson
  audit.ndjson         preserves the hash chain
  blobs/               attachments by content hash
```

- Sensitive fields remain as ciphertext envelopes. The key set is exported separately (see section 4).
- Import verifies every checksum and the audit hash chain before committing. It is transactional: all or nothing.
- The format is versioned. A newer app reads older versions; migrations between versions are code in `packages/core/export`.

## 3. Adapter matrix

| Port       | Cloudflare     | AWS                                      | GCP                                | Azure                         | Kubernetes / self-host                       |
| ---------- | -------------- | ---------------------------------------- | ---------------------------------- | ----------------------------- | -------------------------------------------- |
| Compute    | Workers        | Lambda or ECS Fargate                    | Cloud Run                          | Container Apps or Functions   | Deployment (Node image)                      |
| Repository | DO SQLite      | RDS or Aurora Postgres                   | Cloud SQL Postgres                 | Azure Database for PostgreSQL | Postgres (managed or in-cluster)             |
| Realtime   | DO WebSockets  | API Gateway WebSockets or AppSync Events | Cloud Run SSE with `LISTEN/NOTIFY` | Web PubSub or SSE             | SSE with `LISTEN/NOTIFY`                     |
| Queue      | Queues         | SQS                                      | Pub/Sub                            | Service Bus                   | Postgres queue or NATS                       |
| Blob       | R2             | S3                                       | GCS                                | Blob Storage                  | MinIO or any S3 API                          |
| Keys       | Secrets Store  | KMS                                      | Cloud KMS                          | Key Vault                     | Vault or env with `0600` file                |
| Scheduler  | Cron Triggers  | EventBridge                              | Cloud Scheduler                    | Timer trigger                 | CronJob                                      |
| Edge/WAF   | Cloudflare WAF | CloudFront + AWS WAF                     | Cloud Armor                        | Front Door + WAF              | Ingress + ModSecurity or Cloudflare in front |

Any S3-compatible store works for `Blob`; any Postgres works for the Node repository. Platforms not listed need one new adapter that passes the contract tests.

## 4. Migration runbook (any platform to any platform)

Preconditions: target environment provisioned from `deploy/<target>/`, contract tests green against the target adapters, and a restore drill completed on the target.

| Step | Action                                                                   | Notes                                                                                       |
| ---- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| 1    | Announce a maintenance window                                            | Short; read-only mode is available earlier                                                  |
| 2    | Enable read-only mode on the source                                      | `POST /api/admin/readonly`                                                                  |
| 3    | Export the agency                                                        | `hekara export --agency <id> --out file.age`                                                |
| 4    | Move the key material                                                    | Key provider migration below; never send keys and data together                             |
| 5    | Import on the target                                                     | `hekara import file.age`; verifies checksums and audit chain                                |
| 6    | Validate                                                                 | `hekara verify --source <id> --target <id>` compares counts, checksums and a sample decrypt |
| 7    | Switch DNS                                                               | Low TTL set in advance                                                                      |
| 8    | Smoke test, then lift read-only on the target                            |                                                                                             |
| 9    | Keep the source read-only for the retention period, then securely delete | Delete keys last                                                                            |

Rollback before step 9: point DNS back to the source and lift its read-only flag. No data was altered there.

For large agencies, run steps 3 to 6 once ahead of time as a rehearsal, then do an incremental export (`--since <timestamp>`) inside the window to shorten downtime.

### Key provider migration

Ciphertext does not change. Two options:

1. **Re-wrap (default).** Export the agency data key wrapped by the old master key, unwrap it in a controlled environment, wrap it with the target master key. Nothing is re-encrypted.
2. **Rotate on move.** Import, then run the re-encryption job with a new `keyId` on the target. Use when you also want to retire the old key.

Keys are never written to logs, tickets or chat.

## 5. Platform-to-platform notes

| Move                   | Specific points                                                                                                                                                            |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cloudflare to AWS      | Shard layout becomes one Postgres schema per branch or row-level `agencyId` scoping; realtime moves to API Gateway WebSockets; backups move from R2 to S3 with object lock |
| AWS to Cloudflare      | Postgres rows become per-shard SQLite databases through the import; check each shard stays under the size cap before cutting over                                          |
| Any cloud to self-host | Use the Node entry and Docker image; terminate TLS at a reverse proxy; run `pg_dump` plus the portable export as backups                                                   |
| Any to Kubernetes      | Same container; use a Secrets store CSI driver for keys; HorizontalPodAutoscaler on CPU; a managed Postgres is recommended                                                 |
| Region to region       | Import into a shard pinned to the new jurisdiction; prove deletion on the old one                                                                                          |

## 6. Keeping it portable (rules for contributors)

1. No platform SDK imports outside `packages/adapters-*` (lint-enforced).
2. A new port method needs a contract test and an implementation in every shipped adapter.
3. Schema changes update both dialects and the export format version.
4. SQL stays inside the ANSI-compatible subset used by both SQLite and Postgres; vendor-specific features go behind a repository method with per-adapter implementations.
5. CI runs the full contract suite on every adapter and the export/import round trip between each pair.
6. Document any platform-only capability in `docs/DECISIONS.md` and keep it optional.

## 7. Honest limits

- Per-agency isolation is physically strongest on Cloudflare (one Durable Object per tenant). On Postgres it is logical (scoped queries, optional schema per tenant, optional database per tenant for enterprise).
- Realtime latency and cost characteristics differ by platform; the behavior (events delivered, ordered per agency) is the same and is contract tested.
- A migration still needs a person to provision the target, hold the keys and approve the cutover. The tooling makes that routine; it does not remove the decision.
