# Security

Hekara stores PHI. Security is the top design priority. This document is the single reference for controls; HIPAA.md maps them to the regulation.

## 1. Threat model

| Asset            | Threat                                 | Primary controls                                                                                                          |
| ---------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| PHI at rest      | Stolen disk, backup or database dump   | Field-level AES-256-GCM; encrypted volumes; encrypted backups with separate keys                                          |
| PHI in transit   | Interception                           | TLS 1.3 only, HSTS preload, database `verify-full`                                                                        |
| Accounts         | Phishing, credential stuffing          | Passkeys, Argon2id, invite-only accounts, per-IP and per-account limits, optional TOTP                                    |
| Sessions         | Hijack, CSRF                           | `HttpOnly` `Secure` `SameSite=Strict` cookies, rolling 30 minute idle timeout, 12 hour cap, `Origin` check on every write |
| Tenant isolation | One agency reading another's data      | Scoped repository, physical shard isolation where available, tests                                                        |
| Browser          | XSS, clickjacking, third-party leakage | Strict same-origin CSP with no inline script, a ban on `innerHTML` in client code, frame denial, no third-party origins   |
| Server           | Injection, abuse, DoS                  | Valibot validation, parameterized queries, body limits, WAF, rate limits                                                  |
| Insiders         | Unauthorized access, tampering         | Roles, least privilege, hash-chained audit log                                                                            |
| Supply chain     | Malicious dependency                   | Minimal dependencies, frozen lockfile, audit in CI, SBOM, pinned digests                                                  |
| Secrets          | Leakage                                | Secret store only, never in repo or logs                                                                                  |

## 2. Encryption

| Layer                 | Mechanism                                                                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| In transit            | TLS 1.3, modern ciphers only; HSTS with preload; mutual TLS or authenticated origin pulls between proxy and origin |
| At rest (platform)    | Encrypted disks and managed storage encryption on every platform                                                   |
| At rest (application) | AES-256-GCM per field with a random 96-bit IV; envelope format `v1.<keyId>.<iv>.<ct+tag>`                          |
| Keys                  | Master key in the platform key service; data key per agency wrapped by the master key; short in-memory cache       |
| Searching             | HMAC blind index for exact match; no plaintext index of PHI                                                        |
| Backups               | `age` encryption (X25519 and ChaCha20-Poly1305); recipient key stored apart from the backup                        |
| Passwords             | Argon2id with tuned memory cost; passkeys avoid passwords entirely                                                 |

Cryptography uses WebCrypto and audited libraries only. No custom primitives.

## 3. Authentication and authorization

- Passkeys (WebAuthn) are the default; Argon2id password and TOTP are fallbacks.
- Session: opaque id, 12 hour absolute lifetime, 30 minute idle timeout, rotated on privilege change, revocable per device.
- Roles: `admin`, `scheduler`, `caregiver`, `billing`. Deny by default.
- Authorization is checked in the handler and again in the repository (`agencyId` scope). Caregivers can read only their own visits.
- Enterprise: OIDC or SAML SSO, SCIM, enforced hardware keys for admins.

## 4. Web hardening

| Control       | Setting                                                                                                                                                                                                                                                                             |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSP           | `default-src 'self'; script-src 'self' 'nonce-…'; style-src 'self' 'nonce-…'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`                                                                                                |
| Other headers | `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy` denying unused features, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp` |
| Cookies       | `HttpOnly; Secure; SameSite=Strict; Path=/`, name prefix `hekara`; `Secure` is on whenever `APP_URL` is https and `APP_URL` must be https in production                                                                                                                             |
| CSRF          | `SameSite=Strict` cookies plus a required, exact `Origin` on every state-changing request (ADR-015). No token.                                                                                                                                                                      |
| Rate limits   | 300 requests per minute per address on the API; sign-in 5 per minute per address; 10 failed passwords in 15 minutes lock that account for 15 minutes from any address; TOTP 5 per minute                                                                                            |
| Input         | Valibot on every route; reject unknown fields; size caps                                                                                                                                                                                                                            |
| Output        | Solid escapes by default; no `innerHTML` with data                                                                                                                                                                                                                                  |

## 5. Data handling rules

- PHI never appears in URLs, query strings, logs, metrics, traces, error messages or analytics.
- Logs carry ids only. A redaction layer drops any field tagged as PHI.
- AI features receive redacted input only. Providers without a signed BAA get nothing derived from PHI.
- Exports are encrypted and audited. Downloads require recent re-authentication.
- Deletion: soft delete, then hard delete after the retention period; key destruction for crypto-shredding when an agency leaves.

## 6. Audit log

- Append-only table per shard. Each entry stores `hash = SHA-256(prevHash || canonical(entry))`.
- Written for every PHI read, write, export, login, permission change and failed authorization.
- A verification job recomputes the chain daily and alerts on a break.
- Enterprise option: periodic anchor of the latest hash to an immutable store (object lock).

## 7. Infrastructure hardening

| Area         | Control                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------- |
| Network      | No inbound ports on the origin (tunnel or private networking); WAF and DDoS protection at the edge |
| Containers   | Non-root, read-only filesystem, dropped capabilities, resource limits, pinned digests              |
| Database     | TLS required, least-privilege roles, no public endpoint, row-level scoping                         |
| Secrets      | Secret store, rotated, never in images or repo                                                     |
| Admin access | SSO plus hardware key, just-in-time access, all actions audited                                    |
| Patching     | Automated dependency PRs, weekly review, critical fixes within 72 hours                            |

## 8. Secure development

- Strict TypeScript, Biome lint, no `any` without justification.
- Security tests in CI: cross-agency access attempts, role bypass, plaintext PHI scan of storage and logs, header checks.
- Dependency audit and secret scanning on every PR.
- Code review required; changes to auth, crypto or the audit log need a second reviewer.
- SBOM generated per release.

## 9. Incident response (summary)

1. Detect through alerts (auth anomalies, audit chain break, WAF spikes).
2. Contain: revoke sessions, rotate keys, switch to read-only.
3. Assess scope using the audit log.
4. Notify according to the agency's policy and legal duties.
5. Recover from a verified backup if needed.
6. Write a post-incident review and fix the root cause.

The owner maintains the full written plan; this repo supplies the technical levers.

## 9a. Accounts and roles (as built)

- **Invite-only.** Self-signup is disabled. An admin creates an account and hands the invitee a one-time link (valid 48 hours, single use) to choose a password of 12 or more characters. There is no email service yet, so the link is shown once to the admin.
- **Roles, deny by default:** `admin` (everything), `scheduler` (schedule, overview, visits, search, patients, care plans, caregivers, credentials, hours and fill reports), `caregiver` (own visits only, forced server-side), `billing` (claims and claim figures in reports). Every route lists the roles it allows.
- **Passwords** are Argon2id (19 MiB, 2 passes), parameters stored in the hash, constant-time verify.
- **Second factor:** TOTP with backup codes; passkeys as an alternative sign-in.
- **CSV exports** neutralise cells that start like a spreadsheet formula (`=`, `+`, `-`, `@`) and are audited; care plan and credential changes are audited without their contents.
- **Failure messages are uniform:** wrong password and unknown email return the same response, and unknown emails are counted by the lockout like real ones.
- **Audit:** sign-in, sign-out, passkey, two-factor, password changes, invites, fills, patient creation and searches (length only) are recorded. Schedule reads are recorded at most once per user and view every 5 minutes. Admins can browse the log and run an integrity check; a daily job verifies every agency's chain.

## 10. Known limits

- The account lockout also lets someone deliberately lock another user out for 15 minutes by typing wrong passwords for their email. Tracking is by account, so this is the cost of stopping distributed guessing. Admins can see the pattern in the log.
- Sign-in limits count every attempt from an address, successful or not, so a large office behind one shared address could reach the 5 per minute limit. Behind a proxy, set `TRUST_PROXY=1` so the real client address is used; without it the socket address is used, and a proxy would make everyone look like one address.
- Rate limiters and the lockout are in memory, per instance. With more than one instance, move them to a shared store (they sit behind small interfaces for that).
- Passkey endpoints are wired but have no automated test, because they need a WebAuthn authenticator. Test them manually before relying on them.
- The daily audit job runs inside the server process; run it on one instance only.

- Application-layer encryption protects data from storage and platform operators but not from a fully compromised running app, which holds keys in memory while serving requests. Least privilege, short key caching and monitoring reduce this risk.
- Blind indexes leak equality (two identical values match). They are used only on fields where this is acceptable.
- Security of the deployment depends on the operator following DEPLOYMENT.md.
