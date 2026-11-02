# fb-posts-api

خدمة API وسيطة (Node.js بدون أي مكتبات خارجية) بترجّع آخر 10 بوستات لأي صفحة Facebook عامة، بشكل Response ثابت،
مع كاش دائم على القرص، وإعادة محاولة، وتبديل تلقائي بين المزوّدات.

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
GET /api/v1/facebook/posts?page=<رابط الصفحة>&limit=10
Header: x-api-key: <مفتاح الموقع>      (أو Authorization: Bearer <مفتاح>)
GET /health
```

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
- `apify`: صفحات عامة بدون تسجيل دخول. محتاج `APIFY_TOKEN`. تأكد من حقول Input الخاصة بالـ Actor اللي بتختاره وعدّل `APIFY_INPUT`.
- `graph`: Meta Graph API الرسمي، مجاني، بس للصفحات اللي بتديرها (Page access token لكل صفحة بـ `GRAPH_PAGE_TOKENS`).
  بيتجرّب أولاً للصفحات اللي إلها توكن، وإذا فشل بيحوّل على apify.

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

## ملاحظات مهمة
- روابط الصور واللوغو من CDN فيسبوك بتنتهي صلاحيتها بعد أيام؛ استعمل `onerror` بالـ `<img>` وارجع لـ `page.logo_fallback`.
- `ALLOWED_PAGES` بيحدد الصفحات المسموحة (بيحمي رصيدك من إساءة الاستخدام).
- الـ scraping لصفحات عامة بيخالف شروط استخدام فيسبوك من ناحية تقنية؛ للصفحات اللي بتملكها استعمل Graph API.
