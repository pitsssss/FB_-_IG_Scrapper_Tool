# Draft release notes — v0.1.0-beta.1

**Status:** Draft only. Do not publish a GitHub Release until owner checklist items are complete.  
**Acceptance:** Phase 7F.2 **CONDITIONAL GO** — see [FINAL_ACCEPTANCE_REPORT.md](./FINAL_ACCEPTANCE_REPORT.md).

## Highlights

Self-hosted **Social Media Posts API**: Node.js posts engine + Next.js admin dashboard + Caddy, started with Docker Compose after one-time secret initialization.

- Facebook & Instagram public posts API (`x-api-key`, stable JSON envelope)
- Admin setup, sessions, optional SMTP email verification, TOTP MFA
- Encrypted Apify credential storage + managed API keys
- Interactive Playground (cache-only default; confirmed live refresh)
- Settings, cache inspection/delete, local usage telemetry
- Single-replica Compose stack with persistent `/data`
- Isolated browser acceptance harness (`npm run browser:acceptance`) with mocked Apify for release QA

## Install (Docker-first)

```bash
git clone <repo-url>
cd <repo>
# Linux/macOS:
./scripts/init-selfhost.sh
# Windows PowerShell:
#   .\scripts\init-selfhost.ps1
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

Open `http://127.0.0.1:8080/setup`.

## Known limitations

- Not affiliated with Meta; depends on Apify Actors (and optional Graph) for live data
- Local attempt quota ≠ Apify dollar billing
- Instagram carousel children often incomplete under `basicData`
- Filesystem Apify quota: **one API replica only**
- License: **pending owner decision**
- Live public HTTPS: operator-verified

## Upgrade notes

From earlier Compose layouts: ensure Caddy routes `/api/auth/*` and `/api/management/*` to the dashboard (not a catch-all to the API). Preserve `api_data` volume and the same `DATA_ENCRYPTION_KEY`.
