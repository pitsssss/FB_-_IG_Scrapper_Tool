# Self-hosting guide

Complete Docker Compose deployment for the Social Media Posts API (API + Next.js dashboard + Caddy).

## Requirements

- Docker Engine + Docker Compose v2+
- ~1 GB free disk for images/volumes
- For production HTTPS: a DNS name pointing at your server and ports 80/443 available

You do **not** need a host Node.js install for normal Docker operation. Initialization uses Docker to run the secret generator.

## 1. Clone

```bash
git clone https://github.com/pitsssss/FB_-_IG_Scrapper_Tool.git
cd FB_-_IG_Scrapper_Tool
git checkout v0.1.0-beta.1   # optional: pin to the published beta tag
```

Two install modes:

1. **Source build (local HTTP)** — sections 2–3 below (`docker-compose.yml` + `docker-compose.local.yml` → `http://127.0.0.1:8080`).
2. **Published GHCR images (production HTTPS)** — section 4b (`docker-compose.release.yml`, ports 80/443). Digests: [v0.1.0-beta.1 release](https://github.com/pitsssss/FB_-_IG_Scrapper_Tool/releases/tag/v0.1.0-beta.1).

## 2. Configure secrets (Docker-first)

**Linux / macOS**

```bash
chmod +x scripts/init-selfhost.sh
./scripts/init-selfhost.sh
```

**Windows PowerShell**

```powershell
.\scripts\init-selfhost.ps1
```

This copies `.env.example` → `.env` when missing, then runs `node:22-alpine` with `scripts/generate-compose-secrets.mjs`. It fills **missing** values only (`BOOTSTRAP_SETUP_TOKEN`, `ADMIN_INTERNAL_SECRET`, `DATA_ENCRYPTION_KEY`, safe local defaults) and **never** overwrites existing secrets or regenerates keys on restart.

Developers who already have Node ≥ 22 may instead run `npm run secrets:generate`.

Edit `.env`:

| Variable | Local | Production |
| --- | --- | --- |
| `ADMIN_ALLOWED_ORIGINS` | `http://127.0.0.1:8080` | `https://your.domain` |
| `ADMIN_COOKIE_SECURE` | `0` | `1` |
| `TRUST_PROXY` | `1` | `1` |
| `API_DOMAIN` | `localhost` | `your.domain` |
| `APIFY_TOKEN` | leave empty (connect in UI) | optional |
| `API_KEYS` | optional | optional |

## 3. Start (local HTTP, loopback)

```bash
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

Open **http://127.0.0.1:8080**

## 4. Start (production HTTPS — build from source)

1. Set `API_DOMAIN` and `ADMIN_ALLOWED_ORIGINS=https://API_DOMAIN`.
2. Set `ADMIN_COOKIE_SECURE=1`.
3. Ensure DNS A/AAAA records point to the host.
4. Run:

```bash
docker compose up -d --build
```

Caddy obtains certificates automatically when the domain resolves publicly.

## 4b. Start (production HTTPS — published images)

Use `docker-compose.release.yml` with digest-pinned GHCR images (**linux/amd64**). This binds **80/443**, not loopback 8080.

```bash
export SMP_API_IMAGE='ghcr.io/pitsssss/social-media-posts-api@sha256:c57bdb5dab3250eafd557e9bb596a46eb8e5096b70ad787abe5128cc573a8903'
export SMP_DASHBOARD_IMAGE='ghcr.io/pitsssss/social-media-posts-dashboard@sha256:90acd28bd9078c56e78eed15e307fe5bbc730f7cd9d54a1166251bc3b02ec182'
# .env must also set ADMIN_INTERNAL_SECRET, ADMIN_ALLOWED_ORIGINS, API_DOMAIN, ADMIN_COOKIE_SECURE=1, TRUST_PROXY=1
docker compose --env-file .env -f docker-compose.release.yml up -d
```

See comments in `docker-compose.release.yml` and the [GitHub Release](https://github.com/pitsssss/FB_-_IG_Scrapper_Tool/releases/tag/v0.1.0-beta.1).

## 5. First administrator

1. Open `/setup`
2. Paste `BOOTSTRAP_SETUP_TOKEN` from `.env`
3. Create email + password
4. After success, setup is closed for further takeovers
5. Optionally enroll TOTP MFA under Settings

## What you are configuring

| Secret | Who uses it | Where it lives |
| --- | --- | --- |
| `BOOTSTRAP_SETUP_TOKEN` | First administrator only, once | `.env` (not the public API) |
| Administrator password | Dashboard login | Hashed in SQLite on `api_data` |
| `ADMIN_INTERNAL_SECRET` | Dashboard server talking to the API | `.env` on both services; never send it to browsers |
| `DATA_ENCRYPTION_KEY` | Encrypts stored Apify tokens and TOTP secrets | `.env`; escrow it **outside** the database backup |
| `x-api-key` | Your websites calling `/api/v1/...` | Created in the dashboard; shown once |
| Apify token | Paid/credit upstream for live fetches | Entered in **Providers**; stored encrypted |

`init-selfhost` generates bootstrap, internal, and encryption secrets when they are empty. It does not invent an admin password and does not overwrite keys you already set.

An **Apify token** is an API token from your own [Apify](https://apify.com) account. Live Facebook/Instagram fetches use Apify Actors and can spend Apify usage credits. Cache hits do not. This project is not affiliated with Apify or Meta. Platform availability, permissions, and terms still apply. Optional Meta Graph tokens are only for Pages you administer.

## 6. Connect Apify & create an API key

1. **Providers** → paste your Apify token → validate/connect
2. **API Keys** → create a key + Facebook/Instagram scopes
3. Copy the secret **once**

Playground defaults to **cache-only**. A live refresh asks for confirmation and counts toward the local daily attempt limit (`APIFY_DAILY_RUN_LIMIT`), which is not an Apify dollar budget.

## 7. Test the public API

Through Caddy (same origin):

```bash
curl -s "http://127.0.0.1:8080/health"
curl -s -H "x-api-key: YOUR_KEY" "http://127.0.0.1:8080/api/v1/facebook/posts?page=cern&limit=10"
curl -s -H "x-api-key: YOUR_KEY" "http://127.0.0.1:8080/api/v1/instagram/posts?page=nasa&limit=10"
```

Use Postman offline collection for contract checks without Apify: `npm run postman:offline`.

## 8. Playground / Settings / Cache / Usage

Sign in to the dashboard and use the existing Phase 7D workflows. Cache-only Playground never calls Apify. Live refresh requires explicit confirmation and local quota.

## 9. Day-2 operations

```bash
docker compose ps
docker compose logs -f api dashboard caddy
docker compose restart api
docker compose down          # keeps volumes
docker compose up -d --build # rebuild after git pull
```

Local overlay: add `-f docker-compose.local.yml` to the same commands.

## 10. Backup, restore, upgrade

See [BACKUP_RESTORE.md](./BACKUP_RESTORE.md). Keep `DATA_ENCRYPTION_KEY` with the backup or the database cannot be decrypted.

Upgrade:

```bash
git pull
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

Do not delete the `api_data` volume. Do not regenerate `DATA_ENCRYPTION_KEY` for an existing database. `docker compose down` keeps volumes; `down -v` deletes them.

## 11. Troubleshooting

| Symptom | Check |
| --- | --- |
| Login CSRF / Origin errors | `ADMIN_ALLOWED_ORIGINS` must match the **browser** URL exactly |
| Dashboard “API unavailable” | `ADMIN_INTERNAL_SECRET` must match on api + dashboard; api healthy |
| Cannot write cache | API entrypoint chowns `/data`; volume must stay mounted at `/data` |
| Warming / quota surprises | Single API replica only; quota file is per process |
| Setup page still open | Management DB not persisting — inspect `api_data` volume |
| `/api/auth/*` 404 | Caddy must route BFF to dashboard (not catch-all to api) |

## 12. Security reminders

- Never commit `.env`, volumes, or backups with live keys
- Escrow `DATA_ENCRYPTION_KEY` separately from DB backups
- Do not publish api/dashboard host ports in production
- Do not run multiple API replicas with filesystem quota
