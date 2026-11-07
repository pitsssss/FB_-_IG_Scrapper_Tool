# Security policy

## Supported versions

This project is distributed as a **self-hosted** application. Security fixes target the `main` branch. Operators should pull/rebuild promptly after security releases.

| Branch / tag | Support |
| --- | --- |
| `main` | Current development / release-candidate fixes |
| Published GitHub Releases (when cut by the owner) | Security patches as announced |

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities that could enable unauthorized access, credential theft, or remote code execution.**

Preferred private reporting (when available on this GitHub repository):

1. Use **GitHub Security Advisories** → *Report a vulnerability* on the repository (if enabled by the owner).
2. If advisories are not enabled yet, this is a **release blocker** for a fully public open-source launch until the owner enables private reporting or publishes an authorized contact path. See `docs/release/OWNER_DECISIONS.md`.

Please include:

- Affected version / commit SHA
- Reproduction steps (proof-of-concept against a local disposable install)
- Impact assessment
- Whether you believe credentials in Git history are involved

We will acknowledge reports as soon as the owner’s chosen channel is active.

## Out of scope

- Denial of service against Apify or Meta platforms
- Issues that require already-compromised host Docker sockets or root on the operator machine
- Social-engineering of individual operators’ Apify accounts

## Operator hardening expectations

- Generate unique `BOOTSTRAP_SETUP_TOKEN`, `ADMIN_INTERNAL_SECRET`, and `DATA_ENCRYPTION_KEY`
- Use HTTPS in production (`ADMIN_COOKIE_SECURE=1`)
- Keep a single API replica while filesystem Apify quota is used
- Escrow encryption keys separately from database backups
- Rotate API keys and Apify tokens if exposure is suspected
