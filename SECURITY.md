# Security policy

## Supported versions

This project is distributed as a **self-hosted** application. Security fixes target the `main` branch. Operators should pull/rebuild promptly after security releases.

| Branch / tag | Support |
| --- | --- |
| `main` | Current development / release-candidate fixes |
| Published GitHub Releases (when cut by the owner) | Security patches as announced |

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities that could enable unauthorized access, credential theft, or remote code execution.**

Report privately through **GitHub Security Advisories** on this repository:

1. Open [Security Advisories](https://github.com/pitsssss/FB_-_IG_Scrapper_Tool/security/advisories).
2. Choose **Report a vulnerability**.
3. Provide enough detail for maintainers to reproduce and assess the issue on a local disposable install.

Private vulnerability reporting is enabled for this repository (verified via GitHub’s private-vulnerability-reporting API).

Please include:

- Affected version / commit SHA
- Reproduction steps (proof-of-concept against a local disposable install)
- Impact assessment
- Whether you believe credentials in Git history are involved

Do not expect guaranteed response times unless separately published by the owner.

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
