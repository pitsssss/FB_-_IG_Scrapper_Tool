# Postman — Social Media Posts API (Facebook & Instagram)

One unified Collection v2.1 covering **both** platforms, plus a safe environment template.

## Files to import

| File | Purpose |
|------|---------|
| `Social-Media-Posts-API.postman_collection.json` | **The** collection (exactly two top folders: Facebook + Instagram) |
| `Social-Media-Posts-Local.postman_environment.json` | Shareable **template** — empty `apiKey`; Qasioun URLs pre-filled |
| `.postman-local/Social-Media-Posts-Local.generated.postman_environment.json` | Created by `npm run postman:serve` — real `baseUrl` + local `apiKey` (gitignored) |

Do **not** create two collections. Do **not** put `APIFY_TOKEN` or production secrets in Postman.

## Minimum Desktop workflow

1. Start cache-only API (no paid scrape on startup):

   ```bash
   npm run postman:serve
   ```

2. In Postman Desktop → **Import**:
   - `postman/Social-Media-Posts-API.postman_collection.json`
   - `.postman-local/Social-Media-Posts-Local.generated.postman_environment.json`

3. Select environment **Social Media Posts API — Local Generated**.

4. Send:
   - **Facebook:** `01 — Facebook` → `FB — 02 Real Posts` → **Get Latest 10 Facebook Posts**
   - **Instagram:** `02 — Instagram` → `IG — 02 Real Posts` → **Get Latest 10 Instagram Posts**

Defaults (already set in the generated environment):

| Variable | Default |
|----------|---------|
| `facebookPageUrl` / `pageUrl` | `https://www.facebook.com/cern` |
| `instagramProfileUrl` | `https://www.instagram.com/nasa` |
| `limit` | `10` |
| `baseUrl` | actual listening port from serve |
| `apiKey` | securely generated local key |

**Qasioun Instagram live scrape is not assumed.** In cache-only mode, an uncached profile returns `502 UPSTREAM_UNAVAILABLE` (no Apify call). Do not “Run Collection” to seed accounts.

## Collection tree

```text
Social Media Posts API — Facebook & Instagram
├── 01 — Facebook
│   ├── FB — 01 Health & Authentication     SAFE
│   ├── FB — 02 Real Posts                  CAUTION if cold + live
│   ├── FB — 03 Cache & Persistence         SAFE after seed
│   ├── FB — 04 Validation & Errors         SAFE
│   ├── FB — 05 Client Permissions          SAFE (scoped offline)
│   └── FB — 06 Offline Resilience          SYNTHETIC ONLY (fakeUpstreamUrl)
└── 02 — Instagram
    ├── IG — 01 Health & Authentication     SAFE
    ├── IG — 02 Real Posts                  CAUTION if cold + live
    ├── IG — 03 Cache & Persistence         SAFE after seed
    ├── IG — 04 Validation & Errors         SAFE
    ├── IG — 05 Client Permissions          SAFE (scoped offline)
    └── IG — 06 Offline Resilience          SYNTHETIC ONLY (fakeUpstreamUrl)
```

Shared `/health` appears under both platforms (same endpoint).

## Automated runners

```bash
npm run postman:offline          # fake upstream — zero Apify (both platforms)
npm run postman:live             # ONE controlled Facebook Apify call (CERN fixture)
npm run postman:instagram:live   # at most ONE Instagram Apify call (nasa fixture)
npm run postman:serve            # Desktop — cache-only by default
npm run postman:serve -- --live
npm run postman:serve -- --live --daily-limit=3
npm run postman:collection       # regenerate collection + template from generator
```

`postman:live` / `postman:instagram:live` / `postman:serve` share `.postman-local/live-cache` (posts + `apify-quota.json`). Quota is never reset by starting serve.

## Interpreting responses

| Field | Meaning |
|-------|---------|
| `meta.source=live` | Fresh upstream scrape (counts toward daily Apify budget) |
| `meta.source=cache` | Fresh disk/memory hit — **no** new Apify call |
| `meta.source=stale-cache` | Served while refresh rules apply — good cache preserved |
| `meta.provider` | Upstream provider id (`apify`, `instagram-apify`, …) |
| `meta.count` | Equals `data.posts.length` |
| `meta.limit` | Effective clamped limit |

Errors use `{ "success": false, "error": { "code", "message" } }` — typical codes: `401 UNAUTHORIZED`, `403 PAGE_NOT_ALLOWED`, `429 RATE_LIMITED`, `502 UPSTREAM_UNAVAILABLE`.

## Safety

| Action | Cost |
|--------|------|
| `postman:offline` | None |
| `postman:serve` (cache-only) + cached page/profile | None |
| `postman:serve` + uncached target | None (502) |
| `postman:live` / serve `--live` + uncached | Paid Apify (capped) |
| Collection “Run” on Real Posts in live mode | Can burn many paid runs — **avoid** |

Controlled first live scrape for a new account: raise live budget deliberately, send **one** Real Posts request, then return to cache-only.

## Sharing with another backend engineer

1. Commit/share: collection JSON + environment **template** (empty apiKey).
2. They run `npm run postman:serve`, import the two files listed above, select the generated environment.
3. Never share `.postman-local/*.generated.*` or `.env` with real tokens.

## Regenerating

Source of truth: `scripts/generate-postman-collection.mjs`

```bash
npm run postman:collection
```

Running the generator twice must produce equivalent output (covered by unit tests).
