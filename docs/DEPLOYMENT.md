# Deployment

The same code deploys at every size. Only the entry file, adapters and infrastructure config change.

## 1. Topologies

| Size         | Who                                      | Topology                                                                                               | Typical platform                                              |
| ------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Small clinic | 1 agency, about 5 to 60 caregivers       | One app instance, one data shard                                                                       | Cloudflare Workers (about $5 per month) or one Docker host    |
| Mid-size     | Hundreds of caregivers, several branches | One shard per branch, a search index, staging and production                                           | Cloudflare, or AWS/GCP/Azure containers with managed Postgres |
| Enterprise   | Thousands of caregivers, many regions    | Shards per agency and branch pinned to regions, event stream and warehouse, SSO, customer-managed keys | Dedicated cloud account on any supported platform             |
| On-prem      | Must keep data in the building           | Docker Compose or Kubernetes with Postgres                                                             | Own hardware                                                  |

## 2. Environments

| Environment | Purpose                            | Data                                                     |
| ----------- | ---------------------------------- | -------------------------------------------------------- |
| local       | Development                        | Seeded demo agency; Postgres in Docker or `wrangler dev` |
| staging     | Pre-release checks, restore drills | Synthetic data only; never real PHI                      |
| production  | Live                               | Real PHI, separate keys and accounts from staging        |

Production and staging never share keys, databases or credentials.

## 3. Small clinic

**Cloudflare**

```sh
pnpm install --frozen-lockfile
pnpm wrangler secret put AUTH_SECRET
pnpm wrangler deploy
```

Migrations run on first request per shard. Add the Cloudflare Tunnel, WAF rules and Turnstile on the login page. Enable the encrypted backup cron.

**Single Docker host**

```sh
cp .env.example .env            # set secrets, 0600 permissions
docker compose -f deploy/docker/compose.yml up -d
```

Put a TLS reverse proxy (Caddy) in front and close every other inbound port. Nightly `pg_dump` plus portable export, both encrypted, sent offsite.

## 4. Mid-size

- One shard per branch; the `ShardRouter` reads the branch map from config.
- GitHub Actions: typecheck, lint, tests, contract tests, bundle budget, `pnpm audit`, then deploy to staging, manual approval, then production.
- Database migrations are forward-only and backward-compatible for one release so rollback is safe.

## 5. Enterprise

| Concern    | Approach                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------- |
| Tenancy    | Shard per agency and branch; optional dedicated account or database per customer                   |
| Residency  | Pin shards to a jurisdiction (EU, US, and so on); block cross-region replication                   |
| Identity   | SAML or OIDC SSO, SCIM provisioning, hardware-key enforcement for admins                           |
| Keys       | Customer-managed keys in the platform's KMS; scheduled rotation                                    |
| Reporting  | Event stream to a de-identified warehouse; reports never hit live PHI                              |
| Logging    | OTLP and log stream to the customer's SIEM                                                         |
| Releases   | Canary by percentage, automatic rollback on error budget burn                                      |
| Compliance | BAA with every vendor that touches PHI; evidence collection through the audit log and CI artifacts |

## 6. Release process

1. Merge to main after review and green CI.
2. Deploy to staging automatically; run smoke tests and the contract suite.
3. Manual approval.
4. Canary 5 percent, watch error rate and p95 latency for 15 minutes.
5. Roll out fully, or roll back with one command.
6. Tag the release; attach the SBOM.

## 7. Operations

| Task                         | Frequency                        | How                                                                      |
| ---------------------------- | -------------------------------- | ------------------------------------------------------------------------ |
| Backup verification          | Weekly                           | Restore the latest encrypted backup into staging and run `hekara verify` |
| Dependency audit             | On every PR and weekly           | `pnpm audit`, Renovate                                                   |
| Key rotation                 | Every 12 months, or on suspicion | Rotate `keyId`, run re-encryption job                                    |
| Access review                | Quarterly                        | Review users, roles, sessions                                            |
| Restore drill                | Twice a year                     | Full restore into a clean environment; record the time against RTO       |
| Platform migration rehearsal | Yearly for enterprise            | Follow PORTABILITY.md into a scratch target                              |

## 8. Resource sizing (starting points)

| Size                  | App                             | Database                         |
| --------------------- | ------------------------------- | -------------------------------- |
| Small clinic (Docker) | 0.25 vCPU, 128 MB               | Postgres with 256 MB, 1 GB disk  |
| Mid-size              | 2 instances at 0.5 vCPU, 256 MB | Managed Postgres, 2 vCPU, 4 GB   |
| Enterprise            | Autoscaled per shard group      | Per region, sized by shard count |

Cloudflare Workers and Durable Objects scale on demand; size by cost monitoring rather than provisioning.

## 9. Container hardening (Docker and Kubernetes)

Non-root user, read-only root filesystem, `cap_drop: ALL`, `no-new-privileges`, CPU and memory limits, no host networking, pinned image digests, image scanning in CI, secrets from a secret store instead of environment files where available.
