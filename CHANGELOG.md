# Changelog

All notable changes to **Social Media Posts API** are documented here.

Format inspired by [Keep a Changelog](https://keepachangelog.com/). Versioning follows SemVer once the owner cuts a public release.

## [Unreleased]

### Added

- Docker-first self-host initialization (`scripts/init-selfhost.sh`, `scripts/init-selfhost.ps1`) without requiring host Node.js.
- Consistent management DB backup via SQLite `VACUUM INTO` (`scripts/backup-management.mjs`).
- Release acceptance script (`npm run release:acceptance`) and sanitized historical privacy audit (`npm run privacy:history`).
- Isolated Playwright browser acceptance (`npm run browser:acceptance`) with mocked Apify Compose overlay.
- Open-source project docs: `CONTRIBUTING.md`, `SECURITY.md`, `docs/release/*` including `FINAL_ACCEPTANCE_REPORT.md`.

### Security

- Prefer `X-Real-IP` / right-most `X-Forwarded-For` hop when `TRUST_PROXY=1` (avoid trusting client-spoofable left-most values).
- Dashboard Sign-out sends CSRF header on `/api/auth/logout` (matches BFF CSRF enforcement).
- Optional `APIFY_VERIFY_BASE_URL` for isolated acceptance only (never set in production).

### Changed

- Package metadata: name `social-media-posts-api`, version `0.1.0-beta.1` (release candidate).
- Newman pinned to `6.2.3` (devDependency / CI only).
- Playwright `1.65.0` added as a root devDependency for browser acceptance.

## [0.1.0-beta.1] — release candidate (proposed)

First coordinated release-candidate line covering:

- Posts API (Facebook + Instagram)
- Next.js admin dashboard (auth, MFA, providers, API keys, playground, settings)
- Three-service Docker Compose (Caddy + API + dashboard)

See `docs/release/RELEASE_NOTES_DRAFT.md`.
