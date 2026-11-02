# Postman — Facebook Posts API

Importable Postman Collection v2.1 and local environment template for the Facebook Posts API.

## What this is

| File | Purpose |
|------|---------|
| `Facebook-Posts-API.postman_collection.json` | Full integration & acceptance suite (folders 01–06) |
| `Facebook-Posts-Local.postman_environment.json` | **Template** only — empty `apiKey`, no secrets |

Automated runners (from repo root):

```bash
npm run postman:offline   # fake upstream, zero Apify cost
npm run postman:live      # ONE controlled real Apify call (needs APIFY_TOKEN in .env)
npm run postman:serve     # Desktop API — cache-only (recommended default)
npm run postman:serve -- --live
npm run postman:serve -- --live --daily-limit=3
```

Generating JSON files does **not** import them into Postman Desktop or a cloud workspace. You import once manually (or use Newman).

## Shared local cache (important)

`postman:live` and `postman:serve` both use:

```text
.postman-local/live-cache
```

That directory holds:

- Normalized page cache files (including a previously captured CERN response, if present)
- `apify-quota.json` (UTC-day Apify invocation counter)

Quota is **never reset** by starting serve. Raising `--daily-limit` only raises the **total** allowed invocations for the day; prior consumption still counts.

## Recommended Desktop commands

### Cache-only (safe, no new Apify)

```bash
npm run postman:serve
```

- `APIFY_DAILY_RUN_LIMIT=0`
- Serves pages already in `.postman-local/live-cache` (e.g. CERN after a successful `postman:live`)
- New / uncached `pageUrl` values return the normal error envelope (`502 UPSTREAM_UNAVAILABLE`) — no scrape

### Controlled live (optional)

```bash
npm run postman:serve -- --live
```

Default live budget: **1 total** Apify invocation for the UTC day in the shared cache.

Allow a higher **total** daily budget (example: 3):

```bash
npm run postman:serve -- --live --daily-limit=3
```

Meaning of `--daily-limit=3`:

- It is the **maximum Apify invocations for today** in `.postman-local/live-cache`
- It is **not** “3 extra calls on top of what you already used”
- It is **not** a USD spending limit (USD is capped separately via `APIFY_MAX_CHARGE_USD_PER_RUN`, default `0.15`, or a lower value already set in `.env`)
- If you already consumed 1 today, `--daily-limit=3` permits **2 more** scrapes (3 total)
- Valid range: `1`–`10`
- Requires `--live`
- `UPSTREAM_RETRIES=0`, `WARM_PAGES` empty — **no scrape on startup**; only an explicit Postman **Send** to an uncached page can call Apify

When today’s shared quota is already at the configured limit, serve refuses to start in live mode and tells you to use cache-only or raise the **total** `--daily-limit`.

## Authentication

Headers only:

- `x-api-key: <secret>` (collection default), or
- `Authorization: Bearer <secret>`

**Never** put `APIFY_TOKEN` in Postman. Never put production API keys in a **synced** Postman workspace unless you accept that workspace members can read them.

## Collection folders

1. **01 — Health & Connectivity** — `/health`, 401 without/invalid key  
2. **02 — Real Facebook Posts** — latest posts, cache follow-up, limits, media/empty-caption rules  
3. **03 — Cache Validation** — `source=cache`, stable IDs  
4. **04 — Validation & Error Handling** — 400/401/403/404/405; limit clamping (not 400)  
5. **05 — Multi-Site Authorization** — synthetic client A/B scopes (offline runner only)  
6. **06 — Offline Resilience (synthetic)** — fake upstream 500/empty/502; never real Apify  

## Minimum Desktop workflow

1. Start the API (cache-only recommended):

   ```bash
   npm run postman:serve
   ```

   Note `Listening:`, `CACHE_DIR:`, and the gitignored environment path under `.postman-local/`.

2. In Postman Desktop: **Import** →  
   - `postman/Facebook-Posts-API.postman_collection.json`  
   - `.postman-local/Facebook-Posts-Local.generated.postman_environment.json`

3. Select environment **Facebook Posts API — Local Generated**.

4. Open **02 — Real Facebook Posts → Get Latest 10 Posts**.

5. Set environment variables as needed (no collection rebuild):

   - `pageUrl` — public Facebook page URL (default `https://www.facebook.com/cern`)
   - `limit` — default `10`

6. Press **Send**. Authentication uses the generated `apiKey` automatically.

### How to tell live vs cached

| `meta.source` | Meaning |
|---------------|---------|
| `live` | This response came from a fresh upstream scrape (counts toward daily Apify quota) |
| `cache` | Fresh disk/memory hit — **no** new Apify call |
| `stale-cache` | Served from cache while refresh rules apply — still not a failed wipe |

### Quota exhausted

- Cached pages keep working (`source=cache` / `stale-cache`)
- Uncached pages return `{ "success": false, "error": { "code": "…", "message": "…" } }` (typically `502 UPSTREAM_UNAVAILABLE` when the daily budget blocks Apify)
- No extra Apify attempts are consumed when the reservation fails closed

## Safe vs paid

| Action | Cost |
|--------|------|
| `postman:offline` | None (fake upstream) |
| `postman:serve` (cache-only) + cached `pageUrl` | None |
| `postman:live` / `postman:serve -- --live` + **uncached** `pageUrl` | Paid Apify (capped) |
| Changing `pageUrl` alone | Only bills if that page is not already cached **and** live mode has remaining daily budget |

## Regenerating the collection

```bash
npm run postman:collection
```

## Security notes

- Committed environment template keeps `apiKey` empty  
- Generated GUI environments live under `.postman-local/` (gitignored)  
- Importing a populated environment into a **synced** Postman cloud workspace can upload secret variable values — prefer local/untracked environments for keys  
