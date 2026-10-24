# Product Requirements Document

## 1. Summary

Hekara is scheduling and operations software for home health agencies. A scheduler sees every visit for the day on one live timeline, fills open shifts in a click, avoids overtime, and gets AI suggestions. Billing and compliance sit in the same product. It must be light, secure with PHI, and portable across hosting platforms.

## 2. Problem

Agencies schedule with spreadsheets and heavy legacy tools. Open shifts are found late, overtime is discovered after the fact, and callouts cause phone-tag. Tools that exist are slow, costly to host and tied to one vendor. Agencies also carry HIPAA obligations that generic tools don't help with.

## 3. Users

| User                 | Needs                                                                 |
| -------------------- | --------------------------------------------------------------------- |
| Scheduler            | See today at a glance, fill open shifts, rebalance for overtime       |
| Caregiver            | Know their visits, get notified of changes                            |
| Billing staff        | Turn completed visits into claims and track status                    |
| Admin / owner        | Team and permissions, compliance, reports                             |
| IT / compliance lead | Prove encryption, access control and audit; choose where it is hosted |

## 4. Goals and non-goals

**Goals**

- Live schedule that reflects reality within a second.
- Fill an open shift in under 10 seconds.
- Run a small clinic on a single low-cost deployment and scale to thousands of caregivers by sharding.
- Encrypt PHI in transit, at rest and at the field level.
- Move between hosting platforms with a documented, tested procedure.

**Non-goals (v1)**

- Native mobile apps (responsive web first).
- Payroll processing.
- Direct clearinghouse integration (claims are tracked, exported in standard formats).
- Clinical records (EHR) beyond care-plan references.

## 5. Features

Priorities: P0 launch, P1 soon after, P2 later.

| #   | Feature                                                                                                               | Pri | Acceptance                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------ |
| F1  | **Schedule timeline** (day view): caregivers as rows, 7 AM to 6 PM, visit blocks colored by status, live "now" marker | P0  | Matches the reference design; statuses follow the clock; updates appear in other open tabs within 1 s              |
| F2  | **Week view**                                                                                                         | P1  | Caregivers by 7 days with hours and visit counts                                                                   |
| F3  | **Open shifts panel** with Fill                                                                                       | P0  | Fill assigns the best eligible caregiver (no overlap, within weekly limit) and shows who was chosen; can be undone |
| F4  | **Overtime watch**                                                                                                    | P0  | Lists caregivers at 90% or more of their weekly limit with a progress bar                                          |
| F5  | **AI Copilot**: "N suggestions ready" and Review all                                                                  | P0  | Suggestions to fill open shifts and avoid overtime, with estimated hours saved; apply one or all                   |
| F6  | **Optimize** button                                                                                                   | P1  | Recomputes suggestions on demand                                                                                   |
| F7  | **Search (Cmd/Ctrl+K)** across patients, caregivers, claims                                                           | P0  | Results in under 200 ms; respects permissions                                                                      |
| F8  | **Add a patient** (form and referral import)                                                                          | P0  | Creates an encrypted record; import accepts CSV                                                                    |
| F9  | **Caregivers on shift now** counter and avatar stack                                                                  | P0  | Computed from live visits                                                                                          |
| F10 | **Sidebar badges** (patients, schedule alerts, claims)                                                                | P0  | Computed, not hard-coded                                                                                           |
| F11 | **Billing and claims**                                                                                                | P1  | Draft, submitted, paid, denied; export                                                                             |
| F12 | **Compliance** (credentials, audit view)                                                                              | P1  | Expiring credentials list; audit log viewer for admins                                                             |
| F13 | **Reports**                                                                                                           | P2  | Hours, overtime, fill rate; run from the warehouse copy                                                            |
| F14 | **Notifications** (bell)                                                                                              | P1  | Callouts, new open shifts, suggestion ready                                                                        |
| F15 | **Auth and roles**: admin, scheduler, caregiver, billing; passkeys; optional TOTP                                     | P0  | Role-limited screens and API; sessions expire and rotate                                                           |
| F16 | **Team and permissions**                                                                                              | P1  | Invite users, assign roles, revoke sessions                                                                        |
| F17 | **Portable export and import** per agency                                                                             | P0  | A full agency round-trips between two platforms with identical data (see PORTABILITY)                              |

## 6. Success metrics

| Metric                      | Target                                                                                        |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| Time to fill an open shift  | under 10 s median                                                                             |
| Schedule update latency     | under 1 s p95                                                                                 |
| Server memory, small clinic | under 128 MB (self-host build)                                                                |
| First page load over cable  | under 1 s, under 100 KB JS gzipped                                                            |
| Platform migration          | an agency moved between supported platforms within one maintenance window with zero data diff |
| Security                    | no plaintext PHI in storage or logs, verified by automated test                               |

## 7. Constraints

- Handles PHI: HIPAA safeguards apply (see HIPAA.md).
- No required third-party browser requests.
- Every cloud-specific piece lives behind an adapter.
- Small teams must be able to operate it without a dedicated platform engineer.

## 8. Risks

| Risk                                   | Mitigation                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------ |
| Vendor lock-in                         | Ports and adapters, contract tests, portable export (PORTABILITY.md)                       |
| Single shard limits for large agencies | Shard by branch; warehouse for cross-branch reports                                        |
| Compliance is more than code           | HIPAA.md separates technical safeguards from organizational duties                         |
| AI suggestions leaking PHI             | Redact before any model call; model providers need a BAA; rule-based engine is the default |
| Two data backends drift apart          | Contract tests and schema sync check in CI                                                 |

## 9. Open questions

- Which clearinghouse formats (837P) to export first.
- Whether caregivers get a mobile-optimized app or PWA.
- Licensing model.
