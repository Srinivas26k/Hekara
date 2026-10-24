# HIPAA Support Guide

This document maps Hekara's technical features to HIPAA Security Rule safeguards and lists what remains an organizational duty. It is not legal advice and software alone cannot make an agency compliant.

## 1. Technical safeguards (what the app provides)

| Requirement                                                   | Feature                                                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Access control (unique user ID, automatic logoff, encryption) | Per-user accounts, 30 minute idle timeout, role-based access, field-level and at-rest encryption |
| Audit controls                                                | Hash-chained audit log of every PHI access and change, with daily verification                   |
| Integrity                                                     | AES-GCM authentication tags, hash-chained audit entries, checksummed exports                     |
| Person or entity authentication                               | Passkeys, optional TOTP, SSO for enterprise                                                      |
| Transmission security                                         | TLS 1.3, HSTS, verified database connections                                                     |

## 2. Administrative and physical safeguards (what the owner must do)

| Item                          | Owner action                                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| Business Associate Agreements | Sign a BAA with the hosting provider and every vendor that handles PHI (cloud, email, error tracking, AI) |
| Risk analysis and management  | Perform and document a risk assessment at least yearly                                                    |
| Policies and procedures       | Written policies for access, retention, breach response, sanctions                                        |
| Workforce training            | Train staff at onboarding and yearly                                                                      |
| Access management             | Quarterly review of users and roles; remove access on departure the same day                              |
| Contingency plan              | Backups, restore drills, disaster recovery plan                                                           |
| Breach notification           | Follow the Breach Notification Rule timelines                                                             |
| Physical safeguards           | Device and workstation policies; for on-prem, facility access controls                                    |

## 3. Vendor checklist before sending any PHI

- [ ] BAA signed and stored.
- [ ] The service is within the provider's HIPAA-eligible list.
- [ ] Data region and retention reviewed.
- [ ] Encryption in transit and at rest confirmed.
- [ ] Logging and support access reviewed.

AI providers, email, monitoring and analytics tools are included. If unsure, send no PHI.

## 4. Evidence the app can produce

| Evidence                           | Source                                    |
| ---------------------------------- | ----------------------------------------- |
| Who accessed which record and when | Audit log viewer and export               |
| Proof the log was not altered      | Daily chain verification result           |
| Active users and roles             | Team and permissions screen               |
| Encryption status                  | Configuration report from `hekara doctor` |
| Backup and restore history         | Backup job logs and drill records         |
| Change history of the software     | Release tags, SBOM, CI results            |

## 5. Data subject requests

- Access and accounting of disclosures: audit log filters by patient.
- Amendment: edits are versioned through the audit log.
- Deletion at retention end: hard delete job plus key destruction (crypto-shredding).

## 6. Responsibilities summary

| Area                              | Code               | Owner                 |
| --------------------------------- | ------------------ | --------------------- |
| Encryption, access control, audit | Yes                | Configure and monitor |
| BAAs                              | No                 | Yes                   |
| Policies, training, risk analysis | No                 | Yes                   |
| Breach response                   | Provides tools     | Runs the process      |
| Vendor selection                  | Provides checklist | Decides               |
