# API contract — Facebook & Instagram posts

Stable public contract for integrating independent websites with **fb-posts-api**.

## Endpoints

```
GET /api/v1/facebook/posts?page=<facebook-page-url>&limit=<1..MAX_POSTS>
GET /api/v1/instagram/posts?page=<instagram-profile-url>&limit=<1..MAX_POSTS>
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

Optional `API_KEY_PAGE_SCOPES` restricts each named API key to specific Facebook pages and/or Instagram profiles
(canonical keys from `parsePageRef()` / `parseInstagramRef()`). Global `ALLOWED_PAGES` applies to Facebook only.
Optional `INSTAGRAM_ALLOWED_PROFILES` applies to Instagram only.

**Canonical-key limitation:** a Facebook page slug (e.g. `cern`) and a numeric page id are **not** treated as the same resource unless both appear explicitly in configuration. Instagram keys are always `instagram:<username>`.

## Query parameters

| Name | Required | Description |
| --- | --- | --- |
| `page` | yes | Facebook **page** URL **or** Instagram **profile** URL (depending on route). Max length 500. |
| `limit` | no | Integer clamped to `1..MAX_POSTS` (default `MAX_POSTS`, typically 10). Invalid/negative values are clamped, not rejected. |

Unsupported Facebook paths (groups, reels, login, etc.) → `400 INVALID_PAGE_URL`.
Unsupported Instagram paths (`/p/`, `/reel/`, `/stories/`, …) → `400 INVALID_PAGE_URL`.

### Instagram notes

- Actor: `apify/instagram-post-scraper` (official input: `username`, `resultsLimit`, `skipPinnedPosts`, `dataDetailLevel`).
- Default input uses `dataDetailLevel=basicData` and `includeMusicData=false` (avoid paid extras).
- `stats.shares` is always `0` (not provided by the Actor).
- Hidden likes may appear as `0` (Actor returns `-1`).
- Owner profile photo: used when present on posts; otherwise a documented generic HTTPS fallback. Live coverage is **UNVERIFIED** until a real scrape.

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

## Compatibility

Field names and types above are a **stable contract**. Changing them requires updating this document, `test/schema.js`, OpenAPI (if present), and tests.
