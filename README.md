# fb-posts-api

Unified Facebook & Instagram posts API (Node.js, zero runtime dependencies). Returns the latest posts
for a public Facebook page or Instagram profile in a **stable JSON contract**, with persistent disk cache,
provider fallback, shared Apify quota, auth, and rate limiting.

## التشغيل
```bash
cp .env.example .env      # عدّل API_KEYS و APIFY_TOKEN
npm test                  # اختبارات (بدون إنترنت)
npm start                 # Node 20.6+
```
Docker:
```bash
docker build -t fb-posts-api .
docker run -d -p 3000:3000 -v fbdata:/data --env-file .env fb-posts-api
```
مهم: لازم Volume على `/data` حتى الكاش ما يضيع عند إعادة التشغيل.

## الاستخدام
```
GET /api/v1/facebook/posts?page=<facebook-page-url>&limit=10
GET /api/v1/instagram/posts?page=<instagram-profile-url>&limit=10
Header: x-api-key: <مفتاح الموقع>      (أو Authorization: Bearer <مفتاح>)
GET /health
```

Both data endpoints share the same success/error schema, `x-api-key`, Apify token, and daily Apify
invocation budget. Cache keys are platform-isolated (`cern` vs `instagram:nasa`).

### الـ Response (ثابت دائماً)
```json
{
  "success": true,
  "data": {
    "page": { "id": "123", "name": "CERN", "logo": "https://...", "logo_fallback": "https://graph.facebook.com/cern/picture?type=large", "url": "https://www.facebook.com/cern" },
    "posts": [
      {
        "id": "123_456", "url": "https://www.facebook.com/...", "text": "...", "created_at": "2026-10-20T10:00:00.000Z",
        "image": "https://...", "media": [{ "type": "image", "url": "https://...", "thumbnail": null }],
        "stats": { "likes": 10, "comments": 2, "shares": 1 },
        "page": { "id": "123", "name": "CERN", "logo": "https://...", "logo_fallback": "https://...", "url": "https://www.facebook.com/cern" }
      }
    ]
  },
  "meta": { "source": "live | cache | stale-cache", "provider": "apify", "fetched_at": "...", "cache_age_seconds": 12, "stale": false, "count": 10, "limit": 10, "warning": null }
}
```
الخطأ: `{ "success": false, "error": { "code": "...", "message": "..." } }`
(الأكواد: UNAUTHORIZED 401، MISSING_PAGE/INVALID_PAGE_URL 400، PAGE_NOT_ALLOWED 403، RATE_LIMITED 429، UPSTREAM_UNAVAILABLE 502).

## كيف بيمنع الصفحة الفاضية
1. أول طلب لصفحة: بيجيب من المزوّد (مع إعادة محاولة + backoff) ويخزّن بالكاش (ذاكرة + ملف).
2. طلبات بعدها ضمن `FRESH_TTL_SECONDS`: من الكاش فوراً، بدون كلفة.
3. بعد انتهاء المدة: بيرجّع الكاش القديم فوراً (`source: stale-cache`) وبيحدّث بالخلفية.
4. إذا فشل المزوّد أو رجع 0 بوستات: الكاش القديم ما بيتبدّل أبداً، والموقع بيضل يعرض آخر بوستات ناجحة.
5. بعد فشل، بيستنى `RETRY_COOLDOWN_SECONDS` قبل ما يضرب المزوّد مرة تانية (بيحمي رصيدك).
6. الحالة الوحيدة اللي بترجع خطأ: صفحة ما إلها كاش أبداً + المزوّد واقع.

## المزوّدات
- `apify` (Facebook): `APIFY_ACTOR` / `APIFY_INPUT` — صفحات عامة. يحتاج `APIFY_TOKEN`.
- `instagram-apify`: Actor الرسمي `apify/instagram-post-scraper` عبر `INSTAGRAM_APIFY_ACTOR` /
  `INSTAGRAM_APIFY_INPUT` (نفس `APIFY_TOKEN` ونفس `APIFY_DAILY_RUN_LIMIT`).
- `graph`: Meta Graph API (Facebook فقط) عبر `GRAPH_PAGE_TOKENS`.

Instagram notes: `stats.shares` دائماً `0`؛ likes المخفية قد تظهر `0`؛ صورة البروفايل تُستخدم إن وُجدت في مخرجات الـ Actor وإلا fallback موثّق. تغطية الصورة الحقيقية **غير مثبتة** حتى تشغيل live واحد.

## ربط الموقع (الأفضل من السيرفر مو من المتصفح عشان ما ينكشف المفتاح)
PHP:
```php
$ch = curl_init('https://api.yourdomain.com/api/v1/facebook/posts?page=' . urlencode('https://www.facebook.com/cern') . '&limit=10');
curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 100, CURLOPT_HTTPHEADER => ['x-api-key: YOUR_SITE_KEY']]);
$data = json_decode(curl_exec($ch), true);
foreach (($data['data']['posts'] ?? []) as $p) { echo $p['page']['name'], ' - ', $p['text']; }
```
Node:
```js
const r = await fetch(`${API}/api/v1/facebook/posts?page=${encodeURIComponent(url)}`, { headers: { 'x-api-key': KEY } });
const { data } = await r.json();
```
ملاحظة: أول طلب لصفحة جديدة ممكن ياخد 20–60 ثانية (تشغيل الـ scraper)، اعمل timeout طويل أو سخّن الكاش بطلب مسبق.

## Apify usage protection (daily invocation budget)

This API tracks **outbound Apify run-sync attempts made by this process**, not your whole Apify account spend.

| Setting | Meaning |
| --- | --- |
| `APIFY_DAILY_RUN_LIMIT` | Max Apify HTTP invocations per **UTC day** (default `12`). `0` = cache-only (no Apify calls). |
| `APIFY_MAX_CHARGE_USD_PER_RUN` | Optional Apify query param `maxTotalChargeUsd` for **one** Actor run. Empty = omit. |

Important distinctions:
- The daily limit counts **attempts** (including failures, timeouts, and retries). Cache hits and Graph calls do **not** count.
- `maxTotalChargeUsd` caps a single Actor run; it is **not** a measured account-wide daily USD budget.
- Other Apify usage outside this service is not tracked.
- Consumption resets at the **first reservation on a new UTC date**. Changing the configured limit does **not** reset today's count.
- Quota state lives in `CACHE_DIR/apify-quota.json` (atomic replace). If the file is corrupt or unwritable, Apify calls are **blocked** (fail closed) while existing post cache files are left intact.
- **Production must run a single API replica/worker** with this filesystem quota. Multi-replica safety needs a shared transactional store (not implemented here).

Inspect without mutating: `npm run quota:status`.

## Automatic cache warming

| Setting | Meaning |
| --- | --- |
| `WARM_PAGES` | Comma-separated Facebook page URLs. Empty disables FB warming. |
| `INSTAGRAM_WARM_PROFILES` | Comma-separated Instagram profile URLs. Empty disables IG warming. |
| `WARM_INTERVAL_SECONDS` | Period between cycles. `0` = startup warm only. |
| `WARM_CONCURRENCY` | Parallel warm refreshes (1–8). |
| `WARM_STARTUP_DELAY_SECONDS` | Delay after listen before the first cycle. |

Behavior:
- The HTTP server becomes healthy immediately; warming runs in the background.
- Fresh cache (`FRESH_TTL_SECONDS`) → **no** upstream call.
- Stale/missing cache → existing refresh path (single-flight, cooldown, shared Apify quota, never overwrite good cache with empty/failed results).
- Invalid warm URLs or pages/profiles outside allowlists fail **startup** with a clear error.
- Warming does **not** go through public auth, CORS, or API rate limits.
- SIGINT/SIGTERM stop the warmer cleanly.
- Both lists empty → warmer disabled (no scrape on startup).

### Illustrative example (not a cost/freshness SLA)

Three pages, 6h fresh TTL, daily run limit 12, warm every hour:

```env
FRESH_TTL_SECONDS=21600
APIFY_DAILY_RUN_LIMIT=12
WARM_PAGES=https://www.facebook.com/pageA,https://www.facebook.com/pageB,https://www.facebook.com/pageC
WARM_INTERVAL_SECONDS=3600
WARM_CONCURRENCY=1
WARM_STARTUP_DELAY_SECONDS=10
```

With a 6h TTL, hourly warming usually hits **skipped-fresh** and does not spend Apify attempts. Attempts are used when cache is missing/stale, or after upstream/quota failures according to cooldown. Persist `CACHE_DIR` on a volume so both posts cache and `apify-quota.json` survive restarts.

When Apify is unavailable or the daily quota is exhausted: cached pages keep serving (`cache` / `stale-cache`); pages with no cache return the existing `UPSTREAM_UNAVAILABLE` error envelope.

## ملاحظات مهمة
- روابط الصور واللوغو من CDN فيسبوك/إنستغرام بتنتهي صلاحيتها؛ استعمل `onerror` بالـ `<img>` وارجع لـ `page.logo_fallback`.
- `ALLOWED_PAGES` (Facebook) و `INSTAGRAM_ALLOWED_PROFILES` و `API_KEY_PAGE_SCOPES` يحمون الرصيد.
- الـ scraping لصفحات عامة قد يخالف شروط المنصات؛ للصفحات اللي بتملكها استعمل Graph API حيث ينطبق.
- Run **one** API container/replica while using the filesystem Apify quota (Facebook + Instagram share it).
- Live Instagram acceptance (real Actor run) is a **separate phase** — offline tests use synthetic data only.
