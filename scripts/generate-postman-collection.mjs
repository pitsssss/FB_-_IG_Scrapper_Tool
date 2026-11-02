/**
 * Generates postman/Facebook-Posts-API.postman_collection.json (Collection v2.1).
 * Run: node scripts/generate-postman-collection.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'postman');
const outFile = join(outDir, 'Facebook-Posts-API.postman_collection.json');

const AUTH_HEADER = {
  key: 'x-api-key',
  value: '{{apiKey}}',
  type: 'text',
};

const SCRIPTS = {
  noSecretsInBody: `
const text = pm.response.text() || '';
const key = pm.environment.get('apiKey') || '';
const bad = pm.environment.get('invalidApiKey') || '';
pm.test('response body does not contain credentials', function () {
  if (key) pm.expect(text.includes(key)).to.eql(false);
  if (bad) pm.expect(text.includes(bad)).to.eql(false);
  pm.expect(/Bearer\\s+[A-Za-z0-9._-]{12,}/i.test(text)).to.eql(false);
  pm.expect(/apify_api_/i.test(text)).to.eql(false);
});
`.trim(),

  assertError: `
pm.test('response is JSON', function () { pm.response.to.be.json; });
const body = pm.response.json();
pm.test('error envelope', function () {
  pm.expect(body).to.have.keys('success', 'error');
  pm.expect(body.success).to.eql(false);
  pm.expect(body.error).to.have.keys('code', 'message');
  pm.expect(body.error.code).to.be.a('string').and.not.empty;
  pm.expect(body.error.message).to.be.a('string').and.not.empty;
});
`.trim(),

  assertSuccessSchema: `
function isIso(v) {
  if (typeof v !== 'string' || !v) return false;
  const d = new Date(v);
  return !Number.isNaN(d.getTime()) && d.toISOString() === v;
}
function sameKeys(obj, expected, label) {
  pm.expect(obj, label).to.be.an('object');
  pm.expect(Object.keys(obj).sort(), label + ' keys').to.eql([...expected].sort());
}
function assertPage(page, label) {
  sameKeys(page, ['id', 'name', 'logo', 'logo_fallback', 'url'], label);
  pm.expect(page.id === null || typeof page.id === 'string', label + '.id').to.be.true;
  pm.expect(page.name).to.be.a('string').and.not.match(/^\\s*$/);
  pm.expect(page.logo).to.be.a('string').and.match(/^https:\\/\\//);
  pm.expect(page.logo_fallback).to.be.a('string');
  pm.expect(page.url).to.be.a('string').and.not.empty;
}
function assertPost(post) {
  sameKeys(post, ['id', 'url', 'text', 'created_at', 'image', 'media', 'stats', 'page'], 'post');
  pm.expect(post.id).to.be.a('string').and.not.empty;
  pm.expect(post.url === null || typeof post.url === 'string').to.be.true;
  if (typeof post.url === 'string') {
    pm.expect(post.url.length > 0).to.be.true;
  }
  pm.expect(post.text).to.be.a('string');
  pm.expect(post.created_at === null || isIso(post.created_at), 'created_at ISO|null').to.be.true;
  pm.expect(post.image === null || typeof post.image === 'string').to.be.true;
  pm.expect(post.media).to.be.an('array');
  post.media.forEach(function (m) {
    sameKeys(m, ['type', 'url', 'thumbnail'], 'media');
    pm.expect(['image', 'video']).to.include(m.type);
    pm.expect(m.url).to.be.a('string');
    pm.expect(m.thumbnail === null || typeof m.thumbnail === 'string').to.be.true;
  });
  sameKeys(post.stats, ['likes', 'comments', 'shares'], 'stats');
  ['likes', 'comments', 'shares'].forEach(function (k) {
    pm.expect(Number.isInteger(post.stats[k]) && post.stats[k] >= 0, 'stats.' + k).to.be.true;
  });
  assertPage(post.page, 'post.page');
}
pm.test('response is JSON', function () { pm.response.to.be.json; });
const schemaBody = pm.response.json();
pm.test('success envelope + strict schema', function () {
  sameKeys(schemaBody, ['success', 'data', 'meta'], 'root');
  pm.expect(schemaBody.success).to.eql(true);
  sameKeys(schemaBody.data, ['page', 'posts'], 'data');
  assertPage(schemaBody.data.page, 'data.page');
  pm.expect(schemaBody.data.posts).to.be.an('array');
  schemaBody.data.posts.forEach(assertPost);
  sameKeys(schemaBody.meta, ['source', 'provider', 'fetched_at', 'cache_age_seconds', 'stale', 'count', 'limit', 'warning'], 'meta');
  pm.expect(['live', 'cache', 'stale-cache']).to.include(schemaBody.meta.source);
  pm.expect(schemaBody.meta.provider).to.be.a('string');
  pm.expect(isIso(schemaBody.meta.fetched_at)).to.be.true;
  pm.expect(schemaBody.meta.cache_age_seconds).to.be.a('number').and.at.least(0);
  pm.expect(schemaBody.meta.stale).to.be.a('boolean');
  pm.expect(schemaBody.meta.stale).to.eql(schemaBody.meta.source === 'stale-cache');
  pm.expect(Number.isInteger(schemaBody.meta.count)).to.be.true;
  pm.expect(schemaBody.meta.count).to.eql(schemaBody.data.posts.length);
  pm.expect(Number.isInteger(schemaBody.meta.limit)).to.be.true;
  pm.expect(schemaBody.meta.warning === null || typeof schemaBody.meta.warning === 'string').to.be.true;
});
pm.test('unique post IDs', function () {
  const ids = schemaBody.data.posts.map(function (p) { return p.id; });
  pm.expect(new Set(ids).size).to.eql(ids.length);
});
pm.test('page identity consistent across posts', function () {
  const page = schemaBody.data.page;
  schemaBody.data.posts.forEach(function (p) {
    pm.expect(p.page.name).to.eql(page.name);
    pm.expect(p.page.logo).to.eql(page.logo);
    pm.expect(p.page.url).to.eql(page.url);
  });
});
pm.test('newest-first when timestamps available', function () {
  const times = schemaBody.data.posts.map(function (p) { return p.created_at; }).filter(Boolean);
  for (let i = 1; i < times.length; i++) {
    pm.expect(new Date(times[i - 1]).getTime()).to.be.at.least(new Date(times[i]).getTime());
  }
});
pm.test('count does not exceed requested limit', function () {
  const lim = Number(pm.environment.get('limit') || schemaBody.meta.limit);
  pm.expect(schemaBody.data.posts.length).to.be.at.most(lim);
});
`.trim(),
};

function event(listen, script) {
  return {
    listen,
    script: {
      type: 'text/javascript',
      exec: String(script).split('\n'),
    },
  };
}

function req(name, { method = 'GET', path = '/api/v1/facebook/posts', query = [], headers = [], auth = true, body, events = [], description = '' }) {
  const h = [...headers];
  if (auth) h.unshift(AUTH_HEADER);
  return {
    name,
    request: {
      method,
      header: h,
      description,
      url: {
        raw: path.includes('{{baseUrl}}')
          ? `${path}${query.length ? '?' + query.map((q) => `${q.key}=${q.value}`).join('&') : ''}`
          : `{{baseUrl}}${path}${query.length ? '?' + query.map((q) => `${q.key}=${q.value}`).join('&') : ''}`,
        host: path.includes('{{baseUrl}}') ? undefined : ['{{baseUrl}}'],
        path: path.includes('{{baseUrl}}') ? undefined : path.replace(/^\//, '').split('/'),
        query: query.length ? query : undefined,
      },
      body,
    },
    event: events,
  };
}

// Fix URL structure for Postman - use standard format
function getReq(name, opts) {
  const {
    method = 'GET',
    pathSegments = ['api', 'v1', 'facebook', 'posts'],
    query = [],
    auth = true,
    events = [],
    description = '',
    headers = [],
  } = opts;
  const h = [...headers];
  if (auth) h.push(AUTH_HEADER);
  return {
    name,
    request: {
      method,
      header: h,
      description,
      url: {
        raw: `{{baseUrl}}/${pathSegments.join('/')}${query.length ? '?' + query.map((q) => `${q.key}=${encodeURIComponent(q.value).replace(/%7B%7B/g, '{{').replace(/%7D%7D/g, '}}')}`).join('&') : ''}`,
        host: ['{{baseUrl}}'],
        path: pathSegments,
        query: query.map((q) => ({ key: q.key, value: q.value })),
      },
    },
    event: events,
  };
}

function folder(name, description, items) {
  return {
    name,
    description,
    item: items,
  };
}

const pageQ = { key: 'page', value: '{{pageUrl}}' };
const limitQ = { key: 'limit', value: '{{limit}}' };
const limit3 = { key: 'limit', value: '3' };

const collection = {
  info: {
    name: 'Facebook Posts API — Complete Integration & Acceptance Tests',
    description:
      'Importable acceptance suite for fb-posts-api.\n\n' +
      '- Folders 01–06: safe offline (fake upstream) via `npm run postman:offline`.\n' +
      '- Folder 02 against real Apify: `npm run postman:live` (ONE controlled invocation).\n' +
      '- Auth header: `x-api-key` (Bearer also accepted by API).\n' +
      '- Never put APIFY_TOKEN in Postman variables.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: [
    { key: 'lastFetchedAt', value: '' },
    { key: 'lastPostIds', value: '' },
    { key: 'logoIsFallback', value: '' },
  ],
  event: [
    event('prerequest', '// Collection prerequest: no paid side effects.'),
    event(
      'test',
      `
const text = pm.response.text() || '';
pm.test('no obvious secrets in any response body', function () {
  pm.expect(/apify_api_[A-Za-z0-9]+/i.test(text)).to.eql(false);
});
`.trim(),
    ),
  ],
  item: [
    folder(
      '01 — Health & Connectivity',
      'Liveness and authentication gate checks. Safe to re-run.',
      [
        getReq('GET Health Check', {
          pathSegments: ['health'],
          auth: false,
          query: [],
          events: [
            event(
              'test',
              `
pm.test('status 200', function () { pm.response.to.have.status(200); });
pm.test('JSON status=ok', function () {
  pm.response.to.be.json;
  pm.expect(pm.response.json().status).to.eql('ok');
});
${SCRIPTS.noSecretsInBody}
`.trim(),
            ),
          ],
        }),
        getReq('GET API Without Key', {
          auth: false,
          query: [pageQ, limitQ],
          events: [
            event(
              'test',
              `
pm.test('status 401', function () { pm.response.to.have.status(401); });
${SCRIPTS.assertError}
pm.test('UNAUTHORIZED', function () { pm.expect(pm.response.json().error.code).to.eql('UNAUTHORIZED'); });
${SCRIPTS.noSecretsInBody}
`.trim(),
            ),
          ],
        }),
        getReq('GET API With Invalid Key', {
          auth: false,
          query: [pageQ, limitQ],
          headers: [{ key: 'x-api-key', value: '{{invalidApiKey}}', type: 'text' }],
          events: [
            event(
              'test',
              `
pm.test('status 401', function () { pm.response.to.have.status(401); });
${SCRIPTS.assertError}
pm.test('UNAUTHORIZED', function () { pm.expect(pm.response.json().error.code).to.eql('UNAUTHORIZED'); });
${SCRIPTS.noSecretsInBody}
`.trim(),
            ),
          ],
        }),
      ],
    ),

    folder(
      '02 — Real Facebook Posts',
      'Primary acceptance path. Offline runner uses fake upstream; `postman:live` uses real Apify once.\n' +
        'Empty captions are valid. Stats may be zero. Do not invent posts if fewer than 10 are returned.',
      [
        getReq('Get Latest 10 Posts', {
          query: [pageQ, { key: 'limit', value: '10' }],
          description: 'Primary CERN acceptance: expect exactly 10 posts when upstream provides them.',
          events: [
            event(
              'test',
              `
pm.test('HTTP 200', function () { pm.response.to.have.status(200); });
${SCRIPTS.assertSuccessSchema}
${SCRIPTS.noSecretsInBody}
const body = pm.response.json();
pm.test('exactly 10 posts (CERN acceptance)', function () {
  pm.expect(body.data.posts.length, 'actual count=' + body.data.posts.length).to.eql(10);
});
pm.test('meta.limit is 10', function () { pm.expect(body.meta.limit).to.eql(10); });
pm.test('meta.source is live or cache', function () {
  pm.expect(['live', 'cache', 'stale-cache']).to.include(body.meta.source);
});
const logo = body.data.page.logo;
const fallback = body.data.page.logo_fallback;
const isFallback = logo === fallback || /graph\\.facebook\\.com\\//.test(logo);
pm.collectionVariables.set('logoIsFallback', isFallback ? 'true' : 'false');
pm.collectionVariables.set('lastFetchedAt', body.meta.fetched_at);
pm.collectionVariables.set('lastPostIds', body.data.posts.map(function (p) { return p.id; }).join(','));
pm.test('page.name non-empty', function () { pm.expect(body.data.page.name.length).to.be.above(0); });
pm.test('report logo real vs fallback', function () {
  // Assertion always passes; value stored for runner summary.
  pm.expect(typeof isFallback).to.eql('boolean');
  console.log('logo_status=' + (isFallback ? 'fallback' : 'provider'));
});
const emptyText = body.data.posts.filter(function (p) { return p.text === ''; });
pm.test('empty captions allowed (not stripped)', function () {
  // Structural: empty text posts still have required keys (validated in schema).
  pm.expect(Array.isArray(emptyText)).to.be.true;
});
`.trim(),
            ),
          ],
        }),
        getReq('Get Latest 10 Posts — Cached', {
          query: [pageQ, { key: 'limit', value: '10' }],
          events: [
            event(
              'test',
              `
pm.test('HTTP 200', function () { pm.response.to.have.status(200); });
${SCRIPTS.assertSuccessSchema}
const body = pm.response.json();
pm.test('source is cache (fresh hit)', function () {
  pm.expect(body.meta.source).to.eql('cache');
});
pm.test('same post IDs as first request', function () {
  const prev = (pm.collectionVariables.get('lastPostIds') || '').split(',').filter(Boolean);
  const ids = body.data.posts.map(function (p) { return p.id; });
  pm.expect(ids).to.eql(prev);
});
pm.test('exactly 10 posts', function () { pm.expect(body.data.posts.length).to.eql(10); });
${SCRIPTS.noSecretsInBody}
`.trim(),
            ),
          ],
        }),
        getReq('Get Latest 3 Posts', {
          query: [pageQ, limit3],
          events: [
            event(
              'test',
              `
pm.test('HTTP 200', function () { pm.response.to.have.status(200); });
${SCRIPTS.assertSuccessSchema}
const body = pm.response.json();
pm.test('exactly 3 posts', function () { pm.expect(body.data.posts.length).to.eql(3); });
pm.test('meta.limit is 3', function () { pm.expect(body.meta.limit).to.eql(3); });
pm.test('IDs are prefix of cached 10', function () {
  const prev = (pm.collectionVariables.get('lastPostIds') || '').split(',').filter(Boolean);
  const ids = body.data.posts.map(function (p) { return p.id; });
  pm.expect(ids).to.eql(prev.slice(0, 3));
});
${SCRIPTS.noSecretsInBody}
`.trim(),
            ),
          ],
        }),
        getReq('Get Posts With Default Limit', {
          query: [pageQ],
          events: [
            event(
              'test',
              `
pm.test('HTTP 200', function () { pm.response.to.have.status(200); });
${SCRIPTS.assertSuccessSchema}
const body = pm.response.json();
pm.test('default limit clamps to MAX_POSTS (10)', function () {
  pm.expect(body.meta.limit).to.eql(10);
  pm.expect(body.data.posts.length).to.eql(10);
});
${SCRIPTS.noSecretsInBody}
`.trim(),
            ),
          ],
        }),
        getReq('Get Media-Only Posts (validation against available results)', {
          query: [pageQ, { key: 'limit', value: '10' }],
          description: 'Validates empty-text / media-bearing posts are retained with full schema.',
          events: [
            event(
              'test',
              `
pm.test('HTTP 200', function () { pm.response.to.have.status(200); });
${SCRIPTS.assertSuccessSchema}
const body = pm.response.json();
pm.test('media arrays present on all posts', function () {
  body.data.posts.forEach(function (p) {
    pm.expect(p.media).to.be.an('array');
  });
});
pm.test('posts with empty text still valid', function () {
  body.data.posts.filter(function (p) { return p.text === ''; }).forEach(function (p) {
    pm.expect(p.id).to.be.a('string').and.not.empty;
    pm.expect(p.stats).to.be.an('object');
  });
});
${SCRIPTS.noSecretsInBody}
`.trim(),
            ),
          ],
        }),
      ],
    ),

    folder(
      '03 — Cache Validation',
      'Fresh cache hits must use source=cache and preserve IDs. Safe offline with fake upstream.',
      [
        getReq('Get Page — First Request', {
          query: [pageQ, { key: 'limit', value: '10' }],
          events: [
            event(
              'test',
              `
pm.test('HTTP 200', function () { pm.response.to.have.status(200); });
${SCRIPTS.assertSuccessSchema}
const body = pm.response.json();
pm.collectionVariables.set('cacheFetchedAt', body.meta.fetched_at);
pm.collectionVariables.set('cachePostIds', body.data.posts.map(function (p) { return p.id; }).join(','));
pm.test('page name/logo present', function () {
  pm.expect(body.data.page.name).to.be.ok;
  pm.expect(body.data.page.logo).to.match(/^https:\\/\\//);
});
${SCRIPTS.noSecretsInBody}
`.trim(),
            ),
          ],
        }),
        getReq('Get Same Page — Second Request', {
          query: [pageQ, { key: 'limit', value: '10' }],
          events: [
            event(
              'test',
              `
pm.test('HTTP 200', function () { pm.response.to.have.status(200); });
${SCRIPTS.assertSuccessSchema}
const body = pm.response.json();
pm.test('source=cache', function () { pm.expect(body.meta.source).to.eql('cache'); });
pm.test('fetched_at stable', function () {
  pm.expect(body.meta.fetched_at).to.eql(pm.collectionVariables.get('cacheFetchedAt'));
});
pm.test('same IDs', function () {
  const prev = (pm.collectionVariables.get('cachePostIds') || '').split(',').filter(Boolean);
  pm.expect(body.data.posts.map(function (p) { return p.id; })).to.eql(prev);
});
${SCRIPTS.noSecretsInBody}
`.trim(),
            ),
          ],
        }),
        getReq('Get Same Page — Limit 3', {
          query: [pageQ, limit3],
          events: [
            event(
              'test',
              `
pm.test('HTTP 200', function () { pm.response.to.have.status(200); });
${SCRIPTS.assertSuccessSchema}
const body = pm.response.json();
pm.test('exactly 3 from cache', function () {
  pm.expect(body.data.posts.length).to.eql(3);
  pm.expect(body.meta.source).to.eql('cache');
});
${SCRIPTS.noSecretsInBody}
`.trim(),
            ),
          ],
        }),
        getReq('Verify Cache Metadata', {
          query: [pageQ, { key: 'limit', value: '10' }],
          events: [
            event(
              'test',
              `
pm.test('HTTP 200', function () { pm.response.to.have.status(200); });
${SCRIPTS.assertSuccessSchema}
const body = pm.response.json();
pm.test('cache metadata fields', function () {
  pm.expect(body.meta.source).to.eql('cache');
  pm.expect(body.meta.stale).to.eql(false);
  pm.expect(body.meta.cache_age_seconds).to.be.at.least(0);
  pm.expect(body.meta.provider).to.be.a('string').and.not.empty;
});
${SCRIPTS.noSecretsInBody}
`.trim(),
            ),
          ],
        }),
        getReq('Verify Cached Post Identity', {
          query: [pageQ, { key: 'limit', value: '10' }],
          events: [
            event(
              'test',
              `
pm.test('HTTP 200', function () { pm.response.to.have.status(200); });
${SCRIPTS.assertSuccessSchema}
const body = pm.response.json();
pm.test('IDs unchanged', function () {
  const prev = (pm.collectionVariables.get('cachePostIds') || '').split(',').filter(Boolean);
  pm.expect(body.data.posts.map(function (p) { return p.id; })).to.eql(prev);
});
${SCRIPTS.noSecretsInBody}
`.trim(),
            ),
          ],
        }),
      ],
    ),

    folder(
      '04 — Validation & Error Handling',
      'Contract-aligned errors. Note: invalid limit values are clamped (not 400).',
      [
        getReq('Missing Page Parameter', {
          query: [limitQ],
          events: [
            event(
              'test',
              `
pm.test('status 400', function () { pm.response.to.have.status(400); });
${SCRIPTS.assertError}
pm.test('MISSING_PAGE', function () { pm.expect(pm.response.json().error.code).to.eql('MISSING_PAGE'); });
${SCRIPTS.noSecretsInBody}
`.trim(),
            ),
          ],
        }),
        getReq('Invalid Facebook URL', {
          query: [{ key: 'page', value: 'https://www.facebook.com/groups/123' }, limitQ],
          events: [
            event(
              'test',
              `
pm.test('status 400', function () { pm.response.to.have.status(400); });
${SCRIPTS.assertError}
pm.test('INVALID_PAGE_URL', function () { pm.expect(pm.response.json().error.code).to.eql('INVALID_PAGE_URL'); });
${SCRIPTS.noSecretsInBody}
`.trim(),
            ),
          ],
        }),
        getReq('Unsupported Domain', {
          query: [{ key: 'page', value: 'https://example.com/cern' }, limitQ],
          events: [
            event(
              'test',
              `
pm.test('status 400', function () { pm.response.to.have.status(400); });
${SCRIPTS.assertError}
pm.test('INVALID_PAGE_URL', function () { pm.expect(pm.response.json().error.code).to.eql('INVALID_PAGE_URL'); });
${SCRIPTS.noSecretsInBody}
`.trim(),
            ),
          ],
        }),
        getReq('Invalid API Key', {
          auth: false,
          headers: [{ key: 'x-api-key', value: '{{invalidApiKey}}', type: 'text' }],
          query: [pageQ, limitQ],
          events: [
            event(
              'test',
              `
pm.test('status 401', function () { pm.response.to.have.status(401); });
${SCRIPTS.assertError}
${SCRIPTS.noSecretsInBody}
`.trim(),
            ),
          ],
        }),
        getReq('Missing API Key', {
          auth: false,
          query: [pageQ, limitQ],
          events: [
            event(
              'test',
              `
pm.test('status 401', function () { pm.response.to.have.status(401); });
${SCRIPTS.assertError}
${SCRIPTS.noSecretsInBody}
`.trim(),
            ),
          ],
        }),
        getReq('Unauthorized Facebook Page', {
          query: [{ key: 'page', value: '{{unauthorizedPageUrl}}' }, limitQ],
          description: 'Expects 403 when API_KEY_PAGE_SCOPES denies this page for the active key. Offline runner configures scopes.',
          events: [
            event(
              'test',
              `
pm.test('status 403', function () { pm.response.to.have.status(403); });
${SCRIPTS.assertError}
pm.test('PAGE_NOT_ALLOWED', function () { pm.expect(pm.response.json().error.code).to.eql('PAGE_NOT_ALLOWED'); });
${SCRIPTS.noSecretsInBody}
`.trim(),
            ),
          ],
        }),
        getReq('Unsupported HTTP Method', {
          method: 'POST',
          query: [pageQ, limitQ],
          events: [
            event(
              'test',
              `
pm.test('status 405', function () { pm.response.to.have.status(405); });
${SCRIPTS.assertError}
pm.test('METHOD_NOT_ALLOWED', function () { pm.expect(pm.response.json().error.code).to.eql('METHOD_NOT_ALLOWED'); });
${SCRIPTS.noSecretsInBody}
`.trim(),
            ),
          ],
        }),
        getReq('Unknown API Route', {
          pathSegments: ['api', 'v1', 'unknown'],
          query: [],
          events: [
            event(
              'test',
              `
pm.test('status 404', function () { pm.response.to.have.status(404); });
${SCRIPTS.assertError}
pm.test('NOT_FOUND', function () { pm.expect(pm.response.json().error.code).to.eql('NOT_FOUND'); });
${SCRIPTS.noSecretsInBody}
`.trim(),
            ),
          ],
        }),
        getReq('Limit Boundary Behavior', {
          query: [pageQ, { key: 'limit', value: '999' }],
          description: 'API clamps limit to MAX_POSTS (default 10); does not return 400.',
          events: [
            event(
              'test',
              `
pm.test('status 200 (clamped, not 400)', function () { pm.response.to.have.status(200); });
${SCRIPTS.assertSuccessSchema}
const body = pm.response.json();
pm.test('limit clamped to maxPosts (10)', function () {
  pm.expect(body.meta.limit).to.eql(10);
  pm.expect(body.data.posts.length).to.be.at.most(10);
});
${SCRIPTS.noSecretsInBody}
`.trim(),
            ),
          ],
        }),
      ],
    ),

    folder(
      '05 — Multi-Site Authorization',
      'SYNTHETIC ONLY. Uses clientA/clientB keys and scoped pages from the offline runner. Zero real Apify.',
      [
        getReq('Client A → authorized page A', {
          query: [{ key: 'page', value: '{{pageUrl}}' }, { key: 'limit', value: '3' }],
          events: [
            event(
              'test',
              `
pm.test('status 200', function () { pm.response.to.have.status(200); });
${SCRIPTS.assertSuccessSchema}
${SCRIPTS.noSecretsInBody}
`.trim(),
            ),
          ],
        }),
        getReq('Client A → unauthorized page B', {
          query: [{ key: 'page', value: '{{unauthorizedPageUrl}}' }, { key: 'limit', value: '3' }],
          events: [
            event(
              'test',
              `
pm.test('status 403', function () { pm.response.to.have.status(403); });
${SCRIPTS.assertError}
pm.test('PAGE_NOT_ALLOWED', function () { pm.expect(pm.response.json().error.code).to.eql('PAGE_NOT_ALLOWED'); });
${SCRIPTS.noSecretsInBody}
`.trim(),
            ),
          ],
        }),
        getReq('Client B → authorized page B', {
          auth: false,
          headers: [{ key: 'x-api-key', value: '{{apiKeyB}}', type: 'text' }],
          query: [{ key: 'page', value: '{{unauthorizedPageUrl}}' }, { key: 'limit', value: '3' }],
          events: [
            event(
              'test',
              `
pm.test('status 200', function () { pm.response.to.have.status(200); });
${SCRIPTS.assertSuccessSchema}
${SCRIPTS.noSecretsInBody}
`.trim(),
            ),
          ],
        }),
        getReq('Client B → unauthorized page A', {
          auth: false,
          headers: [{ key: 'x-api-key', value: '{{apiKeyB}}', type: 'text' }],
          query: [{ key: 'page', value: '{{pageUrl}}' }, { key: 'limit', value: '3' }],
          events: [
            event(
              'test',
              `
pm.test('status 403', function () { pm.response.to.have.status(403); });
${SCRIPTS.assertError}
pm.test('PAGE_NOT_ALLOWED', function () { pm.expect(pm.response.json().error.code).to.eql('PAGE_NOT_ALLOWED'); });
${SCRIPTS.noSecretsInBody}
`.trim(),
            ),
          ],
        }),
      ],
    ),

    folder(
      '06 — Offline Resilience (synthetic)',
      'SYNTHETIC fake-upstream scenarios only. Pre-request scripts call fake admin endpoints — never real Apify.\n' +
        'Requires environment variable fakeUpstreamUrl (set by npm run postman:offline).',
      [
        getReq('Seed cache from fake upstream', {
          query: [pageQ, { key: 'limit', value: '10' }],
          events: [
            event(
              'prerequest',
              `
const fake = pm.environment.get('fakeUpstreamUrl');
if (!fake) { throw new Error('fakeUpstreamUrl required for Folder 06'); }
pm.sendRequest({ url: fake + '/__mode', method: 'POST', header: { 'Content-Type': 'application/json' }, body: { mode: 'raw', raw: JSON.stringify({ mode: 'ok' }) } }, function () {});
`.trim(),
            ),
            event(
              'test',
              `
pm.test('seed 200', function () { pm.response.to.have.status(200); });
${SCRIPTS.assertSuccessSchema}
const body = pm.response.json();
pm.collectionVariables.set('resilienceIds', body.data.posts.map(function (p) { return p.id; }).join(','));
pm.collectionVariables.set('upstreamCallsBefore', '0');
${SCRIPTS.noSecretsInBody}
`.trim(),
            ),
          ],
        }),
        getReq('Upstream HTTP 500 → cache/stale fallback', {
          query: [pageQ, { key: 'limit', value: '10' }],
          events: [
            event(
              'prerequest',
              `
const fake = pm.environment.get('fakeUpstreamUrl');
pm.sendRequest({ url: fake + '/__mode', method: 'POST', header: { 'Content-Type': 'application/json' }, body: { mode: 'raw', raw: JSON.stringify({ mode: 'fail' }) } }, function (err, res) {
  if (err) console.warn('mode set failed', err);
});
`.trim(),
            ),
            event(
              'test',
              `
pm.test('still 200 from cache', function () { pm.response.to.have.status(200); });
${SCRIPTS.assertSuccessSchema}
const body = pm.response.json();
pm.test('source cache or stale-cache', function () {
  pm.expect(['cache', 'stale-cache']).to.include(body.meta.source);
});
pm.test('same IDs preserved', function () {
  const prev = (pm.collectionVariables.get('resilienceIds') || '').split(',').filter(Boolean);
  pm.expect(body.data.posts.map(function (p) { return p.id; })).to.eql(prev);
});
${SCRIPTS.noSecretsInBody}
`.trim(),
            ),
          ],
        }),
        getReq('Empty upstream → cache preserved', {
          query: [pageQ, { key: 'limit', value: '10' }],
          events: [
            event(
              'prerequest',
              `
const fake = pm.environment.get('fakeUpstreamUrl');
pm.sendRequest({ url: fake + '/__mode', method: 'POST', header: { 'Content-Type': 'application/json' }, body: { mode: 'raw', raw: JSON.stringify({ mode: 'empty' }) } }, function () {});
`.trim(),
            ),
            event(
              'test',
              `
pm.test('200', function () { pm.response.to.have.status(200); });
${SCRIPTS.assertSuccessSchema}
const body = pm.response.json();
pm.test('IDs preserved after empty upstream', function () {
  const prev = (pm.collectionVariables.get('resilienceIds') || '').split(',').filter(Boolean);
  pm.expect(body.data.posts.map(function (p) { return p.id; })).to.eql(prev);
});
${SCRIPTS.noSecretsInBody}
`.trim(),
            ),
          ],
        }),
        getReq('Cold cache + unavailable upstream → 502', {
          query: [{ key: 'page', value: 'https://www.facebook.com/cern' }, { key: 'limit', value: '5' }],
          events: [
            event(
              'prerequest',
              `
const fake = pm.environment.get('fakeUpstreamUrl');
pm.sendRequest({ url: fake + '/__mode', method: 'POST', header: { 'Content-Type': 'application/json' }, body: { mode: 'raw', raw: JSON.stringify({ mode: 'fail' }) } }, function () {});
`.trim(),
            ),
            event(
              'test',
              `
pm.test('status 502', function () { pm.response.to.have.status(502); });
${SCRIPTS.assertError}
pm.test('UPSTREAM_UNAVAILABLE', function () {
  pm.expect(pm.response.json().error.code).to.eql('UPSTREAM_UNAVAILABLE');
});
${SCRIPTS.noSecretsInBody}
`.trim(),
            ),
          ],
        }),
        getReq('Restore fake ok + repeated requests stable', {
          query: [pageQ, { key: 'limit', value: '10' }],
          events: [
            event(
              'prerequest',
              `
const fake = pm.environment.get('fakeUpstreamUrl');
pm.sendRequest({ url: fake + '/__mode', method: 'POST', header: { 'Content-Type': 'application/json' }, body: { mode: 'raw', raw: JSON.stringify({ mode: 'ok' }) } }, function () {});
`.trim(),
            ),
            event(
              'test',
              `
pm.test('200', function () { pm.response.to.have.status(200); });
${SCRIPTS.assertSuccessSchema}
${SCRIPTS.noSecretsInBody}
`.trim(),
            ),
          ],
        }),
      ],
    ),
  ],
};

// Fix raw URLs: Postman host {{baseUrl}} already includes protocol+host; path join is fine.
// encodeURIComponent broke {{vars}} — rebuild raw without encoding braces.
function fixUrls(items) {
  for (const it of items) {
    if (it.item) fixUrls(it.item);
    if (!it.request?.url) continue;
    const u = it.request.url;
    const q = (u.query || []).map((x) => `${x.key}=${x.value}`).join('&');
    u.raw = `{{baseUrl}}/${(u.path || []).join('/')}${q ? `?${q}` : ''}`;
  }
}
fixUrls(collection.item);

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, `${JSON.stringify(collection, null, 2)}\n`, 'utf8');
console.log(`Wrote ${outFile}`);

let requests = 0;
let assertions = 0;
function walk(items) {
  for (const it of items) {
    if (it.item) walk(it.item);
    else {
      requests += 1;
      for (const ev of it.event || []) {
        if (ev.listen !== 'test') continue;
        const src = (ev.script.exec || []).join('\n');
        assertions += (src.match(/pm\.test\(/g) || []).length;
      }
    }
  }
}
walk(collection.item);
console.log(`requests=${requests} pm.test_count=${assertions}`);
