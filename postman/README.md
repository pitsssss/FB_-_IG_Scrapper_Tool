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
npm run postman:serve     # local API for Postman Desktop (cache-only by default)
npm run postman:serve -- --live   # serve with daily limit 1 + USD cap
```

Generating JSON files does **not** import them into Postman Desktop or a cloud workspace. You import once manually (or use Newman).

## Authentication

The API accepts credentials **only** via headers:

- `x-api-key: <secret>` (used by this collection), or
- `Authorization: Bearer <secret>`

Never put `APIFY_TOKEN` in Postman. Never put production API keys in a synced Postman workspace unless you accept that workspace members can read them.

## Collection folders

1. **01 — Health & Connectivity** — `/health`, 401 without/invalid key  
2. **02 — Real Facebook Posts** — latest posts, cache follow-up, limits, media/empty-caption rules  
3. **03 — Cache Validation** — `source=cache`, stable IDs  
4. **04 — Validation & Error Handling** — 400/401/403/404/405; limit clamping (not 400)  
5. **05 — Multi-Site Authorization** — synthetic client A/B scopes (offline runner only)  
6. **06 — Offline Resilience (synthetic)** — fake upstream 500/empty/502; never real Apify  

## Minimum Desktop workflow

1. Start a local API that matches Postman variables:

   ```bash
   npm run postman:serve
   ```

   Note the printed `Listening:` URL and the **gitignored** environment path under `.postman-local/`.

2. In Postman Desktop: **Import** → select  
   - `postman/Facebook-Posts-API.postman_collection.json`  
   - the generated `.postman-local/Facebook-Posts-Local.generated.postman_environment.json`

3. Select environment **Facebook Posts API — Local Generated**.

4. Open **02 — Real Facebook Posts → Get Latest 10 Posts**.

5. Optionally change only `pageUrl` (e.g. another public page). Leave `apiKey` as generated.

6. Press **Send**.

Default `pageUrl` is `https://www.facebook.com/cern`, `limit` is `10`.

### Cache-only vs live serve

- `npm run postman:serve` sets `APIFY_DAILY_RUN_LIMIT=0` (serves cache / refuses new upstream).  
- `npm run postman:serve -- --live` allows **one** Apify run with `APIFY_MAX_CHARGE_USD_PER_RUN=0.15` (unless already set lower in `.env`).

## Safe vs paid

| Action | Cost |
|--------|------|
| `postman:offline`, folders 01–06 via Newman | None (fake upstream) |
| Folder 03–04 against a warm local cache | None |
| `postman:live` or first cold live GET | **Paid** Apify (capped) |
| Changing `pageUrl` to a new uncached page while live is enabled | May bill |

`meta.source` is `live` | `cache` | `stale-cache`. Fake offline runs still show `live` when the fake upstream answered — that is synthetic, not Apify.

## Regenerating the collection

```bash
npm run postman:collection
```

## Security notes

- Committed environment template keeps `apiKey` empty.  
- Generated GUI environments live under `.postman-local/` (gitignored).  
- Importing a populated environment into a **synced** Postman workspace can upload those values — prefer local/untracked environments for secrets.
