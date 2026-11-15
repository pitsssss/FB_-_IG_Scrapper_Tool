# External beta — Tester installation guide

**Audience:** 2–3 trusted external testers
**Goal:** Install on **your own computer**, explore the dashboard and API, report bugs
**Not in scope:** Public servers, paid Apify runs, shared owner credentials, published Docker images

This guide matches the repository at commit `da2938c` and later `main` / beta branches. Prefer Windows 10/11 + PowerShell; macOS/Linux steps are included where scripts exist.

> **Localhost means your machine.** `http://127.0.0.1:8080` is only reachable on the computer where you run Docker. It is not the project owner's server.

---

## A. Prerequisites

| Requirement | Notes |
| --- | --- |
| **Docker Desktop** (Windows/macOS) or **Docker Engine + Compose v2** (Linux) | Must be running before Compose commands |
| **Git** | Clone the public repository |
| **Disk** | ~2 GB free for images + build cache (safer: 4 GB+) |
| **RAM** | 4 GB+ available to Docker recommended |
| **Ports** | Local install binds **loopback only**: `127.0.0.1:8080` → Caddy. Free that port (or change it only if you know how to update origins) |
| **Browser** | Current Chrome, Edge, or Firefox |
| **Node.js on host** | **Not required** for Docker install (init uses `node:22-alpine`) |

You do **not** need:

- An Apify account (leave token empty for this beta)
- A paid cloud VM
- Pre-published GHCR images (build from source)

---

## B. Clone

```powershell
git clone https://github.com/pitsssss/FB_-_IG_Scrapper_Tool.git
cd FB_-_IG_Scrapper_Tool
git rev-parse HEAD
```

Record the commit SHA in your feedback form.

On macOS/Linux use the same `git clone` / `cd` commands in a terminal.

---

## C. Initialize secrets

**Windows PowerShell** (from the repo root):

```powershell
.\scripts\init-selfhost.ps1
```

**macOS / Linux:**

```bash
chmod +x scripts/init-selfhost.sh scripts/apply-beta-safe-defaults.sh
./scripts/init-selfhost.sh
```

What this does:

1. Copies `.env.example` → `.env` if `.env` is missing
2. Generates missing `BOOTSTRAP_SETUP_TOKEN`, `ADMIN_INTERNAL_SECRET`, and `DATA_ENCRYPTION_KEY`
3. Sets local defaults: `ADMIN_ALLOWED_ORIGINS=http://127.0.0.1:8080`, `ADMIN_COOKIE_SECURE=0`, `TRUST_PROXY=1`, `API_DOMAIN=localhost`
4. **Never overwrites** secrets that already exist

**Never** commit `.env`, paste it into chat, or attach it to GitHub Issues.

---

## D. Safe environment (required for this beta)

`.env.example` defaults `APIFY_DAILY_RUN_LIMIT` to `12`. External beta **must** force zero paid Actor attempts.

**Windows PowerShell:**

```powershell
.\scripts\apply-beta-safe-defaults.ps1 -Confirm
```

**macOS / Linux:**

```bash
./scripts/apply-beta-safe-defaults.sh --confirm
```

`-Confirm` / `--confirm` is required so the script cannot silently rewrite an existing operator `.env`. It refuses non-empty `APIFY_TOKEN`, `ADMIN_COOKIE_SECURE=1`, and non-loopback origins unless you intentionally pass `-Force` / `--force` (still never regenerates secrets).

This sets (without printing secrets):

| Variable | Required beta value | Why |
| --- | --- | --- |
| `APIFY_DAILY_RUN_LIMIT` | `0` | Cache-only — no outbound Apify run-sync attempts |
| `WARM_PAGES` | empty | No Facebook warm refreshes |
| `INSTAGRAM_WARM_PROFILES` | empty | No Instagram warm refreshes |
| `INSTAGRAM_PROFILE_ENRICHMENT` | `0` | No profile enrichment Actor |

Also confirm manually (open `.env` in an editor; do not share the file):

- `APIFY_TOKEN=` is **empty**
- `ADMIN_ALLOWED_ORIGINS=http://127.0.0.1:8080`
- `ADMIN_COOKIE_SECURE=0`

`APIFY_DAILY_RUN_LIMIT=0` is an **operational attempt limit**, not a USD budget. Even with a token later, leave it at `0` unless the owner explicitly approves a paid opt-in exercise.

---

## E. Start (build from source)

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

First build can take several minutes. Published GHCR images are **not** assumed.

Equivalent npm helper (if you have Node): `npm run compose:up`

---

## F. Check containers

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml ps
```

Expect `api`, `dashboard`, and `caddy` **healthy** / running.

Health over the reverse proxy:

```powershell
curl.exe -s http://127.0.0.1:8080/health
```

Expect JSON with a successful health status (typically `"status":"ok"`).

---

## G. Open setup

In your browser:

**http://127.0.0.1:8080/setup**

If setup redirects away, an administrator may already exist on this install — use `/login` instead.

---

## H. Create your administrator

1. Open `.env` locally and copy **only** `BOOTSTRAP_SETUP_TOKEN` into the setup form (do not photograph the whole file).
2. Choose **your own** email and a strong password (not reused from other sites).
3. Submit. Setup should succeed once; a second setup on the same install must fail.
4. You should land in the dashboard (Overview). If the page stays blank after login/setup, hard-refresh once and note it in feedback — post-auth navigation should use a full browser navigation.

---

## I. Login / logout

1. Open **http://127.0.0.1:8080/login**
2. Sign in with your administrator email/password
3. Confirm Overview loads (not a permanent blank screen)
4. Use Logout and confirm you return to the login experience
5. Confirm protected routes redirect when logged out

Optional MFA: Settings → enroll TOTP if you want to exercise that path. Keep recovery codes offline; never paste them into public issues.

---

## J. Create one disposable scoped API key

1. Open **API Keys** in the dashboard
2. Create a key with limited Facebook/Instagram scopes (e.g. allow example public usernames such as `cern` / `nasa` if the UI asks for scopes)
3. Copy the secret **once** into a local password manager
4. Confirm the list shows metadata (name, scopes, created) **without** showing the raw secret again

---

## K. Test public API authentication

Replace `YOUR_KEY` with the secret you copied (keep it private):

```powershell
# Expect 401 without a key
curl.exe -s -o NUL -w "%{http_code}" "http://127.0.0.1:8080/api/v1/facebook/posts?page=cern&limit=1"

# With key — cache-only install may return a structured miss / empty / error for uncached pages.
# That is EXPECTED when APIFY_DAILY_RUN_LIMIT=0 and there is no prior cache.
curl.exe -s -H "x-api-key: YOUR_KEY" "http://127.0.0.1:8080/api/v1/facebook/posts?page=cern&limit=1"
curl.exe -s -H "x-api-key: YOUR_KEY" "http://127.0.0.1:8080/api/v1/instagram/posts?page=nasa&limit=1"
```

`cern` and `nasa` are **public example usernames**, not guaranteed cached content on a fresh install.

---

## L. Explore the dashboard

Walk through (see also `docs/beta/TESTER_CHECKLIST.md`):

- Overview
- Responsive layout: narrow mobile drawer, tablet, desktop sidebar
- Theme toggle (light/dark) if present
- Playground — keep **cache-only** / do not trigger paid upstream
- Cache browser — empty states are normal
- Usage & Logs
- Settings
- API Documentation

Do **not** paste a real Apify token unless the owner has approved a separate paid opt-in exercise.

---

## M. Stop / restart safely (no data loss)

**Stop containers (keeps volumes / admin / keys):**

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml down
```

**Start again:**

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d
```

After restart, login should still work; API keys and settings should persist.

### Destructive commands — do NOT use during beta

```text
docker compose ... down -v     # deletes volumes → wipes admin DB and cache
docker volume prune
```

Only use volume deletion on a disposable install you intentionally want erased.

---

## N. Troubleshooting

| Symptom | What to try |
| --- | --- |
| Docker errors / pipe broken | Start Docker Desktop; wait until it is fully running; retry |
| Port 8080 in use | Stop the other local app using 8080, or use a dedicated machine/VM. Changing the port also requires matching `ADMIN_ALLOWED_ORIGINS` |
| Setup rejected | Confirm `BOOTSTRAP_SETUP_TOKEN` matches `.env`; if admin already exists, use `/login` |
| Blank screen after login | Hard refresh; report browser + OS if it persists |
| CORS / cookie / CSRF errors | Confirm origin is exactly `http://127.0.0.1:8080` (not `localhost` unless you also set that origin) |
| Cache empty / no posts | Expected with `APIFY_DAILY_RUN_LIMIT=0` and no fixtures loaded — not an Apify scrape failure |
| Build fails | Note Docker version + full build error (redact any secrets) |

Logs (redact secrets before sharing):

```powershell
docker compose -f docker-compose.yml -f docker-compose.local.yml logs --tail 80
```

---

## O. Submit feedback

1. Complete `docs/beta/TESTER_CHECKLIST.md` (PASS / FAIL / BLOCKED)
2. File bugs / UX notes with `docs/beta/FEEDBACK_TEMPLATE.md`
3. **Security issues:** private report via `SECURITY.md` — **not** public GitHub Issues
4. Never include passwords, tokens, cookies, or unredacted `.env` contents

---

## Optional: paid Apify later (not this beta)

If the owner later approves live Actors on **your** account:

1. Explicit opt-in from the owner
2. Use **your** Apify token only
3. Review Actor pricing on Apify’s site
4. Raise `APIFY_DAILY_RUN_LIMIT` carefully (attempt count, **not** a dollar cap)
5. Expect real usage charges on Apify’s side

**This first external beta: NO PAID PROVIDER EXECUTION.**

---

## Related docs

- `docs/SELF_HOSTING_GUIDE.md` — general self-host
- `docs/PRODUCTION_CHECKLIST.md` — production hardening
- `docs/BACKUP_RESTORE.md` — backups
- `docs/beta/REMOTE_STAGING_OPTIONAL.md` — optional remote host plan (not provisioned)
- `docs/beta/EXIT_CRITERIA.md` — when beta prep graduates to invitation
