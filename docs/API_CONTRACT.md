# API contract — Facebook & Instagram posts

Stable public contract for integrating independent websites with **fb-posts-api**.

## Endpoints

```
GET /api/v1/facebook/posts?page=<facebook-username>&limit=<1..MAX_POSTS>
GET /api/v1/instagram/posts?page=<instagram-username>&limit=<1..MAX_POSTS>
GET /health  →  { "status": "ok" }
```

Both data endpoints share the **same** success/error JSON schema, authentication, rate limiting,
persistent cache semantics, and Apify daily invocation budget. Cache keys are platform-isolated
(`cern` vs `instagram:nasa`).

## Authentication

Accepted **only** via headers (never query string):

| Header | Value |
| --- | --- |
| `x-api-key: <secret>` | Preferred |
| `Authorization: Bearer <secret>` | Also supported |

Missing or invalid credentials → `401` with error envelope (no account names or scope details).

Keys may come from environment `API_KEYS` and/or dashboard-managed keys (hashed in SQLite). Both authenticate
through the same header pipeline. Managed keys are **deny-by-default** until Facebook/Instagram scopes are assigned.
Environment keys keep legacy unscoped behavior unless `API_KEY_PAGE_SCOPES` is set. Name collisions between
env and managed clients are rejected at creation time.

Optional `API_KEY_PAGE_SCOPES` restricts each named environment API key to specific Facebook pages and/or Instagram profiles
(prefer bare usernames / `instagram:<username>`; legacy trusted URLs still normalize at startup). Global `ALLOWED_PAGES` applies to Facebook only.
Optional `INSTAGRAM_ALLOWED_PROFILES` applies to Instagram only.

**Canonical-key limitation:** a Facebook page slug (e.g. `cern`) and a numeric page id are **not** treated as the same resource unless both appear explicitly in configuration. Instagram keys are always `instagram:<username>`.

## Query parameters

| Name | Required | Description |
| --- | --- | --- |
| `page` | yes | Bare Facebook **page username** or Instagram **username** (depending on route). Full social URLs are rejected. |
| `limit` | no | Integer clamped to `1..MAX_POSTS` (default `MAX_POSTS`, typically 10). Invalid/negative values are clamped, not rejected. |

**Breaking change:** `page` no longer accepts `https://www.facebook.com/…` or `https://www.instagram.com/…`. Pass `cern` / `nasa` style usernames only. The API constructs provider URLs internally.

Full URLs, `@user`, reserved route names, and invalid punctuation → `400 INVALID_PAGE_URL`.

### Instagram notes

- Actor: `apify/instagram-post-scraper` (official input: `username`, `resultsLimit`, `skipPinnedPosts`, `dataDetailLevel`).
- Default input uses `skipPinnedPosts=true`, `dataDetailLevel=basicData`, `includeMusicData=false` (avoid paid extras).
  With `skipPinnedPosts=true`, results are newest accessible **non-pinned** posts (a recently pinned post may be excluded).
- `stats.shares` is always `0` (not provided by the Actor). Zero likes/comments may also mean unavailable (`-1` mapped to `0`).
- Owner profile photo resolution priority (schema unchanged):
  1. Genuine requested-owner image from post Actor fields (`ownerProfilePicUrl` / owner object)
  2. Verified cached profile metadata (optional enrichment store under `CACHE_DIR/instagram-profiles/`)
  3. Explicit company map `INSTAGRAM_PROFILE_LOGOS` (HTTPS only)
  4. Documented generic fallback (`logo === logo_fallback` — **not** a real profile photo)
- Never use commenter / tagged / `coauthorProducers[].profile_pic_url` images as `page.logo`.
- Optional Apify profile enrichment (`INSTAGRAM_PROFILE_ENRICHMENT=1`, Actor `apify/instagram-profile-scraper`) is **disabled by default**, shares the same daily quota + `maxTotalChargeUsd`, and is **not** live-verified until an explicitly approved paid run.
- Controlled dry-run / paid profile validation: `npm run postman:instagram:profile` (default dry-run). Paid path requires `--execute-paid --confirm-cost` and never calls the Post Scraper.
- Sidecar/`basicData`: live NASA capture had `Sidecar` type **without** `childPosts`/`images` → cover `displayUrl` only (incomplete carousel). Complete carousels map `childPosts` in order when present. Do **not** enable `detailedData` without explicit approval.
- Controlled live posts: `npm run postman:instagram:live` (shared `.postman-local/live-cache`).
- Unified Postman Collection: `postman/Social-Media-Posts-API.postman_collection.json` (folders `01 — Facebook` / `02 — Instagram`). Desktop: `npm run postman:serve` then import the collection + `.postman-local/Social-Media-Posts-Local.generated.postman_environment.json`. Template defaults use public demo usernames (`cern` / `nasa`). Cache-only mode returns `502` for uncached profiles until an intentional live seed exists.

## Success response shape

```json
{
  "success": true,
  "data": {
    "page": {
      "id": "100064792144187",
      "name": "CERN",
      "logo": "https://…",
      "logo_fallback": "https://graph.facebook.com/cern/picture?type=large",
      "url": "https://www.facebook.com/cern"
    },
    "posts": [
      {
        "id": "1565287548974302",
        "url": "https://www.facebook.com/…",
        "text": "",
        "created_at": "2026-11-02T08:33:27.000Z",
        "image": "https://…",
        "media": [
          { "type": "video", "url": "https://…", "thumbnail": "https://…" }
        ],
        "stats": { "likes": 4, "comments": 0, "shares": 0 },
        "page": {
          "id": "100064792144187",
          "name": "CERN",
          "logo": "https://…",
          "logo_fallback": "https://graph.facebook.com/cern/picture?type=large",
          "url": "https://www.facebook.com/cern"
        }
      }
    ]
  },
  "meta": {
    "source": "cache",
    "provider": "apify",
    "fetched_at": "2026-11-02T12:00:00.000Z",
    "cache_age_seconds": 12,
    "stale": false,
    "count": 1,
    "limit": 10,
    "warning": null
  }
}
```

(Sample fields derived from the real normalizer + CERN fixture shape; URLs truncated in docs.)

### Field notes

| Field | Rules |
| --- | --- |
| `page.id` | string or `null` |
| `page.name` | non-empty string |
| `page.logo` | `https://…` string (may be Graph fallback) |
| `page.logo_fallback` | always present Graph picture URL |
| `posts[].text` | string; **may be empty** when media exists |
| `posts[].created_at` | ISO-8601 string or `null` |
| `posts[].media[]` | `{ type: "image"\|"video", url, thumbnail }` |
| `posts[].stats.*` | integers ≥ 0 (missing upstream data may appear as `0`) |
| `meta.source` | `live` \| `cache` \| `stale-cache` |
| `meta.stale` | boolean; equals `source === "stale-cache"` |
| `meta.warning` | `null` or string such as `UPSTREAM_REFRESH_FAILED` |

Posts are newest-first by `created_at` when dates exist. Duplicate ids are removed.

## Error response shape

```json
{
  "success": false,
  "error": { "code": "UNAUTHORIZED", "message": "Missing or invalid API key" }
}
```

| HTTP | code |
| --- | --- |
| 401 | `UNAUTHORIZED` |
| 400 | `MISSING_PAGE`, `INVALID_PAGE_URL` |
| 403 | `PAGE_NOT_ALLOWED` |
| 405 | `METHOD_NOT_ALLOWED` |
| 404 | `NOT_FOUND` |
| 429 | `RATE_LIMITED` (+ numeric `Retry-After` header) |
| 502 | `UPSTREAM_UNAVAILABLE` |
| 503 | `NO_PROVIDER_CONFIGURED` |
| 500 | `INTERNAL_ERROR` |

## Cache freshness

| Condition | `meta.source` |
| --- | --- |
| Fresh cache hit | `cache` |
| Stale cache served while refresh runs / fails | `stale-cache` |
| Just fetched from upstream | `live` |

Failed or empty upstream refreshes **never** overwrite a non-empty cache entry.

## Rate limiting

Per authenticated client name (`RATE_LIMIT_PER_MIN`). Exceeding the limit returns `429` with `Retry-After`.

## CORS

Optional `ALLOWED_ORIGINS`. CORS is **not** authentication. Prefer server-to-server calls so API keys never reach browsers.

## Data quality caveats

- Upstream may return fewer than `limit` valid posts.
- Interaction counts may be `0` when Facebook does not provide them.
- CDN image/logo URLs can expire; use `page.logo_fallback` / `onerror` in UIs.
- A URL string does not guarantee the remote asset is still downloadable.
- Public page availability can change; cached content can become stale.

## Admin Playground (management API — not public)

Authenticated administrator sessions only (`admin_session` cookie + CSRF/Origin on mutating routes). **Not** callable with `x-api-key`. Pending-MFA sessions are rejected.

| Method | Path | Behavior |
| --- | --- | --- |
| `GET` | `/api/v1/admin/playground/cache?platform=facebook\|instagram&page=<username>&limit=<n>` | Side-effect-free cache read via `peekCachedPosts`. No provider calls, no quota reservation, no background refresh. `404` + `CACHE_MISS` when absent. Stale entries return data with stale metadata only. |
| `POST` | `/api/v1/admin/playground/prepare` | Validates inputs, allowlists, provider readiness, and local quota; returns a short-lived one-time `confirmationId` bound to session + platform + username + limit. Zero upstream calls. |
| `POST` | `/api/v1/admin/playground/confirm` | Atomically consumes the confirmation, then runs `forceRefresh` through the existing provider pipeline and shared quota. |
| `POST` | `/api/v1/admin/playground/cancel` | Invalidates an unused confirmation. Zero upstream calls. |

Dashboard BFF (same-origin): `GET|POST /api/management/playground` → Node admin routes above. Keep `ADMIN_INTERNAL_SECRET` and `API_INTERNAL_URL` server-only.

**Phase 7E reverse proxy note:** route `/api/management/*` and `/api/auth/*` to Next.js; route `/api/v1/*` and `/health` to the Node API. Do not send browser `/api/management/*` directly to Node without the BFF session bridge.

Success bodies for cache hit / confirmed refresh reuse the public posts success envelope (`success`, `data.page`, `data.posts`, `meta`). Cache-only never claims `meta.source=live`.

Local quota fields shown in prepare responses are **local attempt safeguards**, not Apify account balance or billed spend.

## Compatibility

Field names and types above are a **stable contract**. Changing them requires updating this document, `test/schema.js`, OpenAPI (if present), and tests.
