# Social Media Posts API v0.1.0-beta.1

**Experimental public beta (pre-release).** Not production-stable. No SLA.

Self-hosted platform that returns recent **public** Facebook page posts and Instagram profile posts as a stable JSON API, plus a Next.js administration dashboard (API + dashboard + Caddy via Docker Compose).

Not affiliated with Meta, Facebook, Instagram, or Apify.

## Features

- Facebook Posts API — `GET /api/v1/facebook/posts`
- Instagram Posts API — `GET /api/v1/instagram/posts`
- API-key authentication with platform/page scopes
- Encrypted provider token storage
- Durable disk cache with stale-cache fallback
- Local Apify **attempt** controls (`APIFY_DAILY_RUN_LIMIT` — not a USD budget)
- Responsive Next.js dashboard (desktop / tablet / mobile)
- Administrator setup, login, logout, optional TOTP MFA
- Providers, API keys, Playground, Cache, Usage & Logs, Settings, API docs

## Installation

### Prerequisites

- Docker Engine + Compose v2+
- ~2 GB free disk

### Option A — Build from source (loopback HTTP)

Pins the published tag and uses the local Compose overlay (`127.0.0.1:8080`):

```bash
git clone https://github.com/pitsssss/FB_-_IG_Scrapper_Tool.git
cd FB_-_IG_Scrapper_Tool
git checkout v0.1.0-beta.1
# Windows PowerShell: .\scripts\init-selfhost.ps1
chmod +x scripts/init-selfhost.sh && ./scripts/init-selfhost.sh
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

Open `http://127.0.0.1:8080/setup` and paste `BOOTSTRAP_SETUP_TOKEN` from `.env`.

Guide: [docs/SELF_HOSTING_GUIDE.md](https://github.com/pitsssss/FB_-_IG_Scrapper_Tool/blob/v0.1.0-beta.1/docs/SELF_HOSTING_GUIDE.md)

### Option B — Published images (linux/amd64, production HTTPS)

Packages:

- [social-media-posts-api](https://github.com/pitsssss/FB_-_IG_Scrapper_Tool/pkgs/container/social-media-posts-api)
- [social-media-posts-dashboard](https://github.com/pitsssss/FB_-_IG_Scrapper_Tool/pkgs/container/social-media-posts-dashboard)

Floating tags:

```text
ghcr.io/pitsssss/social-media-posts-api:0.1.0-beta.1
ghcr.io/pitsssss/social-media-posts-dashboard:0.1.0-beta.1
```

**Digest-pinned references (preferred):**

```text
ghcr.io/pitsssss/social-media-posts-api@sha256:c57bdb5dab3250eafd557e9bb596a46eb8e5096b70ad787abe5128cc573a8903
ghcr.io/pitsssss/social-media-posts-dashboard@sha256:90acd28bd9078c56e78eed15e307fe5bbc730f7cd9d54a1166251bc3b02ec182
```

`docker-compose.release.yml` binds **ports 80/443** (not localhost:8080). Set domain + secrets first:

```bash
export SMP_API_IMAGE='ghcr.io/pitsssss/social-media-posts-api@sha256:c57bdb5dab3250eafd557e9bb596a46eb8e5096b70ad787abe5128cc573a8903'
export SMP_DASHBOARD_IMAGE='ghcr.io/pitsssss/social-media-posts-dashboard@sha256:90acd28bd9078c56e78eed15e307fe5bbc730f7cd9d54a1166251bc3b02ec182'
# Also required in .env: ADMIN_INTERNAL_SECRET, ADMIN_ALLOWED_ORIGINS, API_DOMAIN, ADMIN_COOKIE_SECURE=1, TRUST_PROXY=1
docker compose --env-file .env -f docker-compose.release.yml up -d
```

Generate secrets with `scripts/init-selfhost.sh` / `.ps1`. Never reuse another operator’s `.env` or volumes. For a cost-safe first boot, leave `APIFY_TOKEN` empty and set `APIFY_DAILY_RUN_LIMIT=0`.

## Limitations

- Experimental beta — not production-stable
- Provider scraping success is not guaranteed
- Live Apify usage may incur costs on **your** Apify account
- Local attempt quota is **not** a USD spending cap
- Fresh installs have empty caches; cache-miss / upstream-unavailable responses are expected when live fetch is disabled
- Instagram carousel children are often incomplete under `basicData`; `stats.shares` is always `0`
- First published images: **linux/amd64** only
- Independent external tester program was **skipped** by owner decision ([exception record](https://github.com/pitsssss/FB_-_IG_Scrapper_Tool/blob/v0.1.0-beta.1/docs/release/BETA_PUBLICATION_EXCEPTION.md))
- Single API replica while filesystem quota is used

## Security

- Do not publish tokens, `.env`, cookies, or management databases
- Use HTTPS (`ADMIN_COOKIE_SECURE=1`) for remotely exposed instances
- Escrow `DATA_ENCRYPTION_KEY` separately from backups
- Report vulnerabilities privately: [SECURITY.md](https://github.com/pitsssss/FB_-_IG_Scrapper_Tool/blob/v0.1.0-beta.1/SECURITY.md)

## Compliance

- Project source: **Apache-2.0**
- Dashboard image redistributes libvips under **LGPL-3.0-or-later** — see `third-party/NOTICES.txt` inside the image and [DOCKER_THIRD_PARTY_COMPLIANCE.md](https://github.com/pitsssss/FB_-_IG_Scrapper_Tool/blob/v0.1.0-beta.1/docs/release/DOCKER_THIRD_PARTY_COMPLIANCE.md)
- Residual transitive native-library notices are version-pinned; this is not a claim of full legal certification

## Source

- Tag: `v0.1.0-beta.1`
- Commit: `81d4e608e2d2ed6aae9718c859d25b3e85a22879`
