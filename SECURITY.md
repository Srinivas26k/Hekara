# Security policy

Hekara is designed to handle health-related data, so we take security reports seriously and appreciate responsible disclosure.

## Reporting a vulnerability

**Please do not open a public issue, discussion or pull request for a security problem.**

Report it privately using either:

1. **GitHub private vulnerability reporting:** go to the [Security tab](https://github.com/Srinivas26k/Hekara/security/advisories/new) and choose _Report a vulnerability_. (Preferred.)
2. **Email:** srinivasvarma764@gmail.com with the subject `Hekara security`.

Please include what you found, how to reproduce it, the version or commit, and the impact you expect. **Never include real patient or staff data** in a report; use the synthetic demo data.

## What to expect

This is a small, volunteer-run project, so these are goals rather than guarantees:

- acknowledgement within **3 business days**;
- an initial assessment within **10 business days**;
- a fix or mitigation plan for confirmed issues, prioritised by severity, with credit to you in the release notes if you wish.

## Scope

In scope: this repository's code, its default configuration, and its documentation, for example authentication and session handling, authorisation and tenant isolation, encryption and key handling, the audit log, injection and cross-site issues, and the CSV export.

Out of scope: issues that need a malicious or already-compromised administrator, social engineering, denial of service by sheer volume, findings in third-party dependencies with no demonstrated impact on Hekara (report those upstream), and deployments you configured insecurely, such as running without TLS or with default demo passwords.

## Supported versions

Hekara is in alpha. Only the latest commit on `main` and the latest tagged release receive security fixes.

## Safe harbour

If you act in good faith, follow this policy, avoid privacy violations and service disruption, and give us reasonable time to fix an issue before disclosing it, we will not pursue legal action against you for your research.

## Known limitations

The project has not had an independent security audit. Known gaps are listed in [docs/SECURITY.md](docs/SECURITY.md#10-known-limits). If you are interested in funding a review, see [COMMERCIAL.md](COMMERCIAL.md).
