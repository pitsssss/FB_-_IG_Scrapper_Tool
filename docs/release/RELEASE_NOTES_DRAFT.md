# Release notes — Social Media Posts API v0.1.0-beta.1

**Status:** Preflight-ready draft for a **GitHub Pre-release**.
**Not published in Step 5E-1.** No Git tag and no GHCR images have been pushed by this phase.

## Product

Social Media Posts API is a **self-hosted** platform that fetches and normalizes recent **public** Facebook page posts and Instagram profile posts for your backends. It provides:

- A stable JSON public API (`x-api-key`)
- A Next.js administration dashboard
- Docker Compose deployment (API + dashboard + Caddy)

It is **not** a hosted SaaS and is **not** affiliated with Meta, Facebook, Instagram, or Apify.

License: **Apache-2.0** (project source). The dashboard container also redistributes libvips under **LGPL-3.0-or-later**; see `third-party/NOTICES.txt` and `docs/release/DOCKER_THIRD_PARTY_COMPLIANCE.md`.

## Features

- Facebook Posts API (`GET /api/v1/facebook/posts`)
- Instagram Posts API (`GET /api/v1/instagram/posts`)
- API-key authentication with platform/page authorization scopes
- Encrypted provider token storage (`DATA_ENCRYPTION_KEY`)
- Durable disk cache with stale-cache fallback (never wipe good cache on upstream failure)
- Local Apify **attempt** controls (`APIFY_DAILY_RUN_LIMIT` — not a USD budget)
- Responsive Next.js dashboard (desktop / tablet / mobile)
- Administrator bootstrap, login, logout, optional TOTP MFA
- Providers, API keys, Playground, Cache, Usage & Logs, Settings, API docs
- Docker deployment (source-build today; image-based after GHCR publication)

## Installation

### Prerequisites

- Docker Engine + Compose v2+
- ~2 GB free disk for images/build cache
- Loopback or DNS for your chosen deployment mode

### Option A — Build from source (available now)

```bash
git clone https://github.com/pitsssss/FB_-_IG_Scrapper_Tool.git
cd FB_-_IG_Scrapper_Tool
# Windows: .\scripts\init-selfhost.ps1
chmod +x scripts/init-selfhost.sh && ./scripts/init-selfhost.sh
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

Open `http://127.0.0.1:8080/setup`, paste `BOOTSTRAP_SETUP_TOKEN` from `.env`, create your administrator.

Full guide: `docs/SELF_HOSTING_GUIDE.md`.

### Option B — Published images (only after Step 5E-2)

Planned references (digests recorded at publication):

- `ghcr.io/pitsssss/social-media-posts-api:0.1.0-beta.1`
- `ghcr.io/pitsssss/social-media-posts-dashboard:0.1.0-beta.1`

Use `docker-compose.release.yml` with `SMP_API_IMAGE` / `SMP_DASHBOARD_IMAGE` set to digest-pinned references.
**Do not advertise Option B until images are public and a clean install using them has passed.**

### Fresh setup requirements

- Generate unique secrets (`init-selfhost` / `secrets:generate`)
- Never reuse another operator’s `.env` or volumes
- For cost-safe first boot: leave `APIFY_TOKEN` empty and set `APIFY_DAILY_RUN_LIMIT=0`
- Escrow `DATA_ENCRYPTION_KEY` separately from database backups

## Limitations (beta)

- **Beta software** — experimental; not production-stable; no uptime or support SLA
- Provider success is **not** guaranteed; Meta/Apify availability and terms apply
- Live scraping may incur **Apify costs** on your account
- Local quota is an **attempt counter**, not a USD spending cap
- Empty cache with live fetch disabled/unavailable can return structured upstream errors
- Instagram carousel children are often incomplete under `basicData`; `stats.shares` is always `0`
- Requires appropriate provider accounts and compliance with platform terms
- First published images target **linux/amd64** only (no verified arm64)
- **No independent external tester program was completed** before this first public beta (owner exception — see `docs/release/BETA_PUBLICATION_EXCEPTION.md`)
- One API replica only while filesystem quota is used

## Security

- Do not publish tokens, `.env`, session cookies, or management databases
- Use HTTPS (`ADMIN_COOKIE_SECURE=1`) for any remotely exposed instance
- Safeguard backup and encryption keys
- Report vulnerabilities privately via GitHub Security Advisories (`SECURITY.md`)

## Verification performed before preflight close

Automated suites and isolated Docker smokes on the release-candidate commit (see preflight report).
Owner previously verified real Facebook/Instagram scraping on their private install.
Live Apify was **not** re-executed during Step 5E-1.
