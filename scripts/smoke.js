import { pathToFileURL } from 'node:url';
import { assertResponseShape, assertErrorShape } from '../test/schema.js';

function pass(name, detail = '') {
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail) {
  console.error(`FAIL  ${name} — ${detail}`);
}

async function get(baseUrl, path, { key, timeoutMs = 30_000, method = 'GET', headers = {} } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const h = { ...headers };
    if (key) h['x-api-key'] = key;
    const res = await fetch(`${baseUrl}${path}`, { method, headers: h, signal: ctrl.signal });
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { status: res.status, headers: res.headers, body, text };
  } finally {
    clearTimeout(t);
  }
}

export async function runSmoke(baseUrl, apiKey, pageUrl) {
  let failed = 0;
  const check = (name, ok, detail) => {
    if (ok) pass(name, detail);
    else { fail(name, detail); failed += 1; }
  };

  try {
    const health = await get(baseUrl, '/health');
    check('GET /health', health.status === 200 && health.body?.status === 'ok', `status=${health.status}`);

    const noKey = await get(baseUrl, `/api/v1/facebook/posts?page=${encodeURIComponent(pageUrl)}`);
    let errOk = false;
    try { assertErrorShape(noKey.body); errOk = true; } catch (e) { fail('no-key shape', e.message); failed += 1; }
    check('no key -> 401', noKey.status === 401 && errOk, `status=${noKey.status}`);

    const badKey = await get(baseUrl, `/api/v1/facebook/posts?page=${encodeURIComponent(pageUrl)}`, { key: 'wrong-key' });
    check('wrong key -> 401', badKey.status === 401, `status=${badKey.status}`);

    const missing = await get(baseUrl, '/api/v1/facebook/posts', { key: apiKey });
    check(
      'missing page -> 400 MISSING_PAGE',
      missing.status === 400 && missing.body?.error?.code === 'MISSING_PAGE',
      `status=${missing.status} code=${missing.body?.error?.code}`,
    );

    const invalid = await get(baseUrl, '/api/v1/facebook/posts?page=https://example.com/x', { key: apiKey });
    check(
      'non-Facebook URL -> 400 INVALID_PAGE_URL',
      invalid.status === 400 && invalid.body?.error?.code === 'INVALID_PAGE_URL',
      `status=${invalid.status} code=${invalid.body?.error?.code}`,
    );

    const live = await get(
      baseUrl,
      `/api/v1/facebook/posts?page=${encodeURIComponent(pageUrl)}`,
      { key: apiKey, timeoutMs: 180_000 },
    );
    let shapeOk = false;
    try { assertResponseShape(live.body); shapeOk = true; } catch (e) { fail('live shape', e.message); failed += 1; }
    check(
      'valid page -> 200 response shape',
      live.status === 200 && shapeOk,
      `status=${live.status} source=${live.body?.meta?.source} count=${live.body?.meta?.count}`,
    );

    const t0 = Date.now();
    const cached = await get(baseUrl, `/api/v1/facebook/posts?page=${encodeURIComponent(pageUrl)}`, { key: apiKey });
    const elapsed = Date.now() - t0;
    check(
      'repeat < 2s and source cache',
      cached.status === 200 && cached.body?.meta?.source === 'cache' && elapsed < 2000,
      `source=${cached.body?.meta?.source} ${elapsed}ms`,
    );

    const limited = await get(
      baseUrl,
      `/api/v1/facebook/posts?page=${encodeURIComponent(pageUrl)}&limit=3`,
      { key: apiKey },
    );
    check(
      'limit=3 -> exactly 3 posts',
      limited.status === 200 && limited.body?.data?.posts?.length === 3,
      `count=${limited.body?.data?.posts?.length}`,
    );

    const posts = limited.body?.data?.posts || [];
    const everyPage = posts.every((p) => p.page?.name && p.page?.logo);
    check('every post has page.name and page.logo', everyPage, `posts=${posts.length}`);

    const posted = await get(
      baseUrl,
      `/api/v1/facebook/posts?page=${encodeURIComponent(pageUrl)}`,
      { key: apiKey, method: 'POST' },
    );
    check('POST -> 405', posted.status === 405, `status=${posted.status}`);

    const unknown = await get(baseUrl, '/nope', { key: apiKey });
    check('unknown route -> 404', unknown.status === 404, `status=${unknown.status}`);
  } catch (err) {
    fail('smoke unexpected', err?.message || String(err));
    failed += 1;
  }

  return failed === 0;
}

async function main() {
  const [baseUrl, apiKey, pageUrl] = process.argv.slice(2);
  if (!baseUrl || !apiKey || !pageUrl) {
    console.error('Usage: node scripts/smoke.js <baseUrl> <apiKey> <pageUrl>');
    process.exit(1);
  }
  const ok = await runSmoke(baseUrl.replace(/\/+$/, ''), apiKey, pageUrl);
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
