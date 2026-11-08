# Release notes — v0.1.0-beta.1

**Status:** Prepared for owner review. **Not published.** No Git tag and no container images have been pushed.

## Overview

Social Media Posts API is a self-hosted service that returns recent **public** Facebook page posts and Instagram profile posts as a stable JSON API, plus a Next.js admin dashboard. You run it with Docker Compose (API, dashboard, and Caddy). It is not a hosted SaaS and is not affiliated with Meta, Facebook, Instagram, or Apify.

License: **Apache-2.0** (this project’s source). The dashboard image also redistributes libvips under **LGPL-3.0-or-later**; see `third-party/NOTICES.txt`.

## What you can do

- `GET /api/v1/facebook/posts` and `GET /api/v1/instagram/posts` with an `x-api-key`
- Create the first administrator with a one-time bootstrap token (no shared default password)
- Optional email OTP (if you configure SMTP) and TOTP MFA
- Store an Apify token encrypted at rest and create scoped API keys
- Use Playground (cache-only unless you confirm a live refresh)
- Inspect cache, settings, and local attempt telemetry
- Exercise the contract with Postman offline (`npm run postman:offline`) without calling Apify

## Install

Build from source (images are not on a registry yet):

```bash
git clone https://github.com/pitsssss/FB_-_IG_Scrapper_Tool.git
cd FB_-_IG_Scrapper_Tool
chmod +x scripts/init-selfhost.sh
./scripts/init-selfhost.sh
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

Open `http://127.0.0.1:8080/setup`. Full steps: `docs/SELF_HOSTING_GUIDE.md`.

Live fetches need your own Apify token and can spend Apify credits. Cache hits do not. Facebook and Instagram availability still depends on those providers and their terms.

## Security

Report vulnerabilities privately via GitHub Security Advisories (see `SECURITY.md`). Do not commit `.env` or the management database.

## Known beta limitations

- Public HTTPS on a real domain is **operator-configured**, not pre-deployed by this project
- No paid Apify acceptance was run for this release; default tests use mocks
- Instagram carousel children are often incomplete under `basicData`; `stats.shares` is `0`
- One API replica only (filesystem quota)
- First published images, when they exist, are planned as `linux/amd64` only
- Historical Git rewrite cleaned ordinary `main` history; pre-rewrite pull-request refs or external copies may still exist. That residual risk is accepted by the owner. It is not a claim of Internet-wide deletion

## Not in this publication step

- GitHub Release: not created
- Git tag `v0.1.0-beta.1`: not created
- GHCR images: not pushed
