/**
 * Generates the unified Postman Collection v2.1 + environment template.
 *
 * Outputs:
 *   postman/Social-Media-Posts-API.postman_collection.json
 *   postman/Social-Media-Posts-Local.postman_environment.json
 *
 * Run: node scripts/generate-postman-collection.mjs
 *
 * Safety:
 * - Offline / Offline Resilience folders require fakeUpstreamUrl (synthetic only).
 * - Real Posts folders may hit Apify if cache is cold — prefer cache-only serve for Desktop.
 * - Never put APIFY_TOKEN in Postman variables.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'postman');
const collectionFile = join(outDir, 'Social-Media-Posts-API.postman_collection.json');
const envTemplateFile = join(outDir, 'Social-Media-Posts-Local.postman_environment.json');
const isDirectRun =
  Boolean(process.argv[1]) && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);

export const COLLECTION_NAME = 'Social Media Posts API — Facebook & Instagram';
/** Neutral public demo defaults for the shareable Postman template (not customer accounts). */
export const FB_DEFAULT = 'https://www.facebook.com/cern';
export const IG_DEFAULT = 'https://www.instagram.com/nasa/';
export const FB_UNAUTHORIZED_DEFAULT = 'https://www.facebook.com/nasa';
export const IG_UNAUTHORIZED_DEFAULT = 'https://www.instagram.com/natgeo/';

const AUTH_HEADER = { key: 'x-api-key', value: '{{apiKey}}', type: 'text' };

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
  if (typeof post.url === 'string') pm.expect(post.url.length > 0).to.be.true;
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
    script: { type: 'text/javascript', exec: String(script).split('\n') },
  };
}

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
        raw: `{{baseUrl}}/${pathSegments.join('/')}${query.length ? `?${query.map((q) => `${q.key}=${q.value}`).join('&')}` : ''}`,
        host: ['{{baseUrl}}'],
        path: pathSegments,
        query: query.map((q) => ({ key: q.key, value: q.value })),
      },
    },
    event: events,
  };
}

function folder(name, description, items) {
  return { name, description, item: items };
}

function modeSet(mode) {
  return `
const fake = pm.environment.get('fakeUpstreamUrl');
if (!fake) { throw new Error('fakeUpstreamUrl required for Offline Resilience (synthetic only)'); }
pm.sendRequest({ url: fake + '/__mode', method: 'POST', header: { 'Content-Type': 'application/json' }, body: { mode: 'raw', raw: JSON.stringify({ mode: '${mode}' }) } }, function () {});
`.trim();
}

function buildHealthAuth(prefix, pageVar) {
  const pageQ = { key: 'page', value: `{{${pageVar}}}` };
  const limitQ = { key: 'limit', value: '{{limit}}' };
  const path = pageVar.startsWith('instagram')
    ? ['api', 'v1', 'instagram', 'posts']
    : ['api', 'v1', 'facebook', 'posts'];
  return folder(`${prefix} — 01 Health & Authentication`, 'SAFE. Liveness + auth gate. No Apify.', [
    getReq('Health Check', {
      pathSegments: ['health'],
      auth: false,
      query: [],
      description: 'GET /health — shared liveness probe.',
      events: [event('test', `
pm.test('status 200', function () { pm.response.to.have.status(200); });
pm.test('JSON status=ok', function () { pm.response.to.be.json; pm.expect(pm.response.json().status).to.eql('ok'); });
${SCRIPTS.noSecretsInBody}
`.trim())],
    }),
    getReq('Missing API Key', {
      pathSegments: path,
      auth: false,
      query: [pageQ, limitQ],
      events: [event('test', `
pm.test('status 401', function () { pm.response.to.have.status(401); });
${SCRIPTS.assertError}
pm.test('UNAUTHORIZED', function () { pm.expect(pm.response.json().error.code).to.eql('UNAUTHORIZED'); });
${SCRIPTS.noSecretsInBody}
`.trim())],
    }),
    getReq('Invalid API Key', {
      pathSegments: path,
      auth: false,
      query: [pageQ, limitQ],
      headers: [{ key: 'x-api-key', value: '{{invalidApiKey}}', type: 'text' }],
      events: [event('test', `
pm.test('status 401', function () { pm.response.to.have.status(401); });
${SCRIPTS.assertError}
pm.test('UNAUTHORIZED', function () { pm.expect(pm.response.json().error.code).to.eql('UNAUTHORIZED'); });
${SCRIPTS.noSecretsInBody}
`.trim())],
    }),
  ]);
}

function buildFacebookRealPosts() {
  const pageQ = { key: 'page', value: '{{facebookPageUrl}}' };
  const path = ['api', 'v1', 'facebook', 'posts'];
  return folder(
    'FB — 02 Real Posts',
    'CAUTION: cold cache + live Apify token may trigger ONE paid Facebook scrape.\n' +
      'Prefer cache-only serve for Desktop. Default account: {{facebookPageUrl}} (public demo page).\n' +
      'Offline runner uses fake upstream — safe.',
    [
      getReq('Get Latest 10 Facebook Posts', {
        pathSegments: path,
        query: [pageQ, { key: 'limit', value: '10' }],
        description: 'Primary Facebook request for {{facebookPageUrl}}. Expect ≤10 posts; exact-10 only when upstream provides them.',
        events: [event('test', `
pm.test('HTTP 200', function () { pm.response.to.have.status(200); });
${SCRIPTS.assertSuccessSchema}
${SCRIPTS.noSecretsInBody}
const body = pm.response.json();
pm.test('meta.limit is 10', function () { pm.expect(body.meta.limit).to.eql(10); });
pm.test('facebook page url host', function () { pm.expect(body.data.page.url).to.match(/facebook\\.com\\//i); });
pm.test('post URLs are Facebook when present', function () {
  body.data.posts.filter(function (p) { return p.url; }).forEach(function (p) {
    pm.expect(p.url).to.match(/facebook\\.com\\//i);
  });
});
pm.collectionVariables.set('fbLastFetchedAt', body.meta.fetched_at);
pm.collectionVariables.set('fbLastPostIds', body.data.posts.map(function (p) { return p.id; }).join(','));
const logo = body.data.page.logo;
const fallback = body.data.page.logo_fallback;
const isFallback = logo === fallback || /graph\\.facebook\\.com\\//.test(logo);
console.log('fb_logo_status=' + (isFallback ? 'fallback' : 'provider') + ' count=' + body.data.posts.length);
pm.test('report count (exact-10 not required for arbitrary accounts)', function () {
  pm.expect(body.data.posts.length).to.be.at.most(10);
});
`.trim())],
      }),
      getReq('Get Latest 10 Facebook Posts — Cached', {
        pathSegments: path,
        query: [pageQ, { key: 'limit', value: '10' }],
        description: 'SAFE after a successful prior hit — expects source=cache.',
        events: [event('test', `
pm.test('HTTP 200', function () { pm.response.to.have.status(200); });
${SCRIPTS.assertSuccessSchema}
const body = pm.response.json();
pm.test('source is cache', function () { pm.expect(body.meta.source).to.eql('cache'); });
pm.test('same post IDs', function () {
  const prev = (pm.collectionVariables.get('fbLastPostIds') || '').split(',').filter(Boolean);
  pm.expect(body.data.posts.map(function (p) { return p.id; })).to.eql(prev);
});
${SCRIPTS.noSecretsInBody}
`.trim())],
      }),
      getReq('Get Latest 3 Facebook Posts', {
        pathSegments: path,
        query: [pageQ, { key: 'limit', value: '3' }],
        events: [event('test', `
pm.test('HTTP 200', function () { pm.response.to.have.status(200); });
${SCRIPTS.assertSuccessSchema}
const body = pm.response.json();
pm.test('exactly 3 posts', function () { pm.expect(body.data.posts.length).to.eql(3); });
pm.test('IDs are prefix of cached set', function () {
  const prev = (pm.collectionVariables.get('fbLastPostIds') || '').split(',').filter(Boolean);
  pm.expect(body.data.posts.map(function (p) { return p.id; })).to.eql(prev.slice(0, 3));
});
${SCRIPTS.noSecretsInBody}
`.trim())],
      }),
      getReq('Get Facebook Posts With Default Limit', {
        pathSegments: path,
        query: [pageQ],
        events: [event('test', `
pm.test('HTTP 200', function () { pm.response.to.have.status(200); });
${SCRIPTS.assertSuccessSchema}
const body = pm.response.json();
pm.test('default limit clamps to 10', function () {
  pm.expect(body.meta.limit).to.eql(10);
  pm.expect(body.data.posts.length).to.be.at.most(10);
});
${SCRIPTS.noSecretsInBody}
`.trim())],
      }),
      getReq('Get Facebook Media Validation', {
        pathSegments: path,
        query: [pageQ, { key: 'limit', value: '10' }],
        events: [event('test', `
pm.test('HTTP 200', function () { pm.response.to.have.status(200); });
${SCRIPTS.assertSuccessSchema}
const body = pm.response.json();
pm.test('media arrays present', function () {
  body.data.posts.forEach(function (p) { pm.expect(p.media).to.be.an('array'); });
});
${SCRIPTS.noSecretsInBody}
`.trim())],
      }),
    ],
  );
}

function buildInstagramRealPosts() {
  const pageQ = { key: 'page', value: '{{instagramProfileUrl}}' };
  const path = ['api', 'v1', 'instagram', 'posts'];
  return folder(
    'IG — 02 Real Posts',
    'CAUTION: cold cache may trigger ONE paid Instagram Post Scraper run.\n' +
      'Default account: {{instagramProfileUrl}} (public demo profile).\n' +
      'Cache-only mode returns 502 when the profile is uncached — do not assume a warm cache.\n' +
      'Do not assert real profile photo or carousel children without verification.\n' +
      'Offline runner uses fake upstream — safe.',
    [
      getReq('Get Latest 10 Instagram Posts', {
        pathSegments: path,
        query: [pageQ, { key: 'limit', value: '10' }],
        description: 'Primary Instagram request for {{instagramProfileUrl}}.',
        events: [event('test', `
pm.test('HTTP 200 or clean 502 when uncached/cache-only', function () {
  pm.expect([200, 502]).to.include(pm.response.code);
});
if (pm.response.code === 200) {
  ${SCRIPTS.assertSuccessSchema}
  const body = pm.response.json();
  pm.test('instagram page url', function () { pm.expect(body.data.page.url).to.match(/instagram\\.com\\//i); });
  pm.test('post permalinks when present', function () {
    body.data.posts.filter(function (p) { return p.url; }).forEach(function (p) {
      pm.expect(/instagram\\.com\\/(p|reel)\\//i.test(p.url)).to.eql(true);
    });
  });
  pm.test('shares are non-negative (Instagram Actor has no shares → 0)', function () {
    body.data.posts.forEach(function (p) { pm.expect(p.stats.shares).to.eql(0); });
  });
  const logo = body.data.page.logo;
  const fallback = body.data.page.logo_fallback;
  const isFallback = logo === fallback || /anonymousUser\\.jpg/i.test(logo);
  console.log('ig_logo_status=' + (isFallback ? 'fallback' : 'provider_or_config') + ' count=' + body.data.posts.length);
  pm.collectionVariables.set('igLastFetchedAt', body.meta.fetched_at);
  pm.collectionVariables.set('igLastPostIds', body.data.posts.map(function (p) { return p.id; }).join(','));
} else {
  ${SCRIPTS.assertError}
  pm.test('UPSTREAM_UNAVAILABLE when no cache', function () {
    pm.expect(pm.response.json().error.code).to.eql('UPSTREAM_UNAVAILABLE');
  });
}
${SCRIPTS.noSecretsInBody}
`.trim())],
      }),
      getReq('Get Latest 10 Instagram Posts — Cached', {
        pathSegments: path,
        query: [pageQ, { key: 'limit', value: '10' }],
        description: 'Expect source=cache after a prior 200. Skip/fail cleanly if prior request was 502.',
        events: [event('test', `
const prev = (pm.collectionVariables.get('igLastPostIds') || '').split(',').filter(Boolean);
if (!prev.length) {
  pm.test('skipped — no prior successful IG seed in this run', function () { pm.expect(true).to.eql(true); });
} else {
  pm.test('HTTP 200', function () { pm.response.to.have.status(200); });
  ${SCRIPTS.assertSuccessSchema}
  const body = pm.response.json();
  pm.test('source is cache', function () { pm.expect(body.meta.source).to.eql('cache'); });
  pm.test('same post IDs', function () {
    pm.expect(body.data.posts.map(function (p) { return p.id; })).to.eql(prev);
  });
}
${SCRIPTS.noSecretsInBody}
`.trim())],
      }),
      getReq('Get Latest 3 Instagram Posts', {
        pathSegments: path,
        query: [pageQ, { key: 'limit', value: '3' }],
        events: [event('test', `
const prev = (pm.collectionVariables.get('igLastPostIds') || '').split(',').filter(Boolean);
if (!prev.length) {
  pm.test('skipped — no prior successful IG seed', function () { pm.expect(true).to.eql(true); });
} else {
  pm.test('HTTP 200', function () { pm.response.to.have.status(200); });
  ${SCRIPTS.assertSuccessSchema}
  const body = pm.response.json();
  pm.test('exactly 3 posts', function () { pm.expect(body.data.posts.length).to.eql(3); });
  pm.test('IDs prefix', function () {
    pm.expect(body.data.posts.map(function (p) { return p.id; })).to.eql(prev.slice(0, 3));
  });
}
${SCRIPTS.noSecretsInBody}
`.trim())],
      }),
      getReq('Get Instagram Posts With Default Limit', {
        pathSegments: path,
        query: [pageQ],
        events: [event('test', `
if (pm.response.code !== 200) {
  pm.test('non-200 allowed when uncached', function () { pm.expect([401,403,502]).to.include(pm.response.code); });
} else {
  ${SCRIPTS.assertSuccessSchema}
  const body = pm.response.json();
  pm.test('default limit is 10', function () { pm.expect(body.meta.limit).to.eql(10); });
}
${SCRIPTS.noSecretsInBody}
`.trim())],
      }),
      getReq('Verify Instagram Account Identity', {
        pathSegments: path,
        query: [pageQ, { key: 'limit', value: '10' }],
        events: [event('test', `
if (pm.response.code !== 200) {
  pm.test('skipped identity when not 200', function () { pm.expect(true).to.eql(true); });
} else {
  ${SCRIPTS.assertSuccessSchema}
  const body = pm.response.json();
  pm.test('page.url is instagram profile', function () {
    pm.expect(body.data.page.url).to.match(/instagram\\.com\\//i);
  });
  pm.test('every post.page matches data.page', function () {
    body.data.posts.forEach(function (p) {
      pm.expect(p.page.name).to.eql(body.data.page.name);
      pm.expect(p.page.logo).to.eql(body.data.page.logo);
      pm.expect(p.page.url).to.eql(body.data.page.url);
    });
  });
}
${SCRIPTS.noSecretsInBody}
`.trim())],
      }),
      getReq('Verify Instagram Media (optional presence)', {
        pathSegments: path,
        query: [pageQ, { key: 'limit', value: '10' }],
        description: 'Reports video/carousel presence; does not require carousel children (basicData may omit them).',
        events: [event('test', `
if (pm.response.code !== 200) {
  pm.test('skipped media when not 200', function () { pm.expect(true).to.eql(true); });
} else {
  ${SCRIPTS.assertSuccessSchema}
  const body = pm.response.json();
  const hasVideo = body.data.posts.some(function (p) { return p.media.some(function (m) { return m.type === 'video'; }); });
  const hasCarousel = body.data.posts.some(function (p) {
    return p.media.filter(function (m) { return m.type === 'image'; }).length >= 2;
  });
  console.log('ig_has_video=' + hasVideo + ' ig_has_multi_image=' + hasCarousel);
  pm.test('media arrays present', function () {
    body.data.posts.forEach(function (p) { pm.expect(p.media).to.be.an('array'); });
  });
}
${SCRIPTS.noSecretsInBody}
`.trim())],
      }),
    ],
  );
}

function buildCacheFolder(prefix, pageVar, idVar, fetchedVar, pathSegments) {
  const pageQ = { key: 'page', value: `{{${pageVar}}}` };
  return folder(
    `${prefix} — 03 Cache & Persistence`,
    'SAFE after a successful seed in this run. Uses cached responses — no new Apify when fresh.',
    [
      getReq('First Request (seed / inspect)', {
        pathSegments,
        query: [pageQ, { key: 'limit', value: '10' }],
        events: [event('test', `
pm.test('status 200 or 502', function () { pm.expect([200, 502]).to.include(pm.response.code); });
if (pm.response.code === 200) {
  ${SCRIPTS.assertSuccessSchema}
  const body = pm.response.json();
  pm.collectionVariables.set('${idVar}', body.data.posts.map(function (p) { return p.id; }).join(','));
  pm.collectionVariables.set('${fetchedVar}', body.meta.fetched_at);
}
${SCRIPTS.noSecretsInBody}
`.trim())],
      }),
      getReq('Repeated Request — Cache', {
        pathSegments,
        query: [pageQ, { key: 'limit', value: '10' }],
        events: [event('test', `
const prev = (pm.collectionVariables.get('${idVar}') || '').split(',').filter(Boolean);
if (!prev.length) {
  pm.test('skipped — no seed', function () { pm.expect(true).to.eql(true); });
} else {
  pm.test('HTTP 200', function () { pm.response.to.have.status(200); });
  ${SCRIPTS.assertSuccessSchema}
  const body = pm.response.json();
  pm.test('source=cache', function () { pm.expect(body.meta.source).to.eql('cache'); });
  pm.test('IDs stable', function () {
    pm.expect(body.data.posts.map(function (p) { return p.id; })).to.eql(prev);
  });
}
${SCRIPTS.noSecretsInBody}
`.trim())],
      }),
      getReq('Limit 3 From Cache', {
        pathSegments,
        query: [pageQ, { key: 'limit', value: '3' }],
        events: [event('test', `
const prev = (pm.collectionVariables.get('${idVar}') || '').split(',').filter(Boolean);
if (!prev.length) {
  pm.test('skipped', function () { pm.expect(true).to.eql(true); });
} else {
  pm.test('HTTP 200', function () { pm.response.to.have.status(200); });
  ${SCRIPTS.assertSuccessSchema}
  const body = pm.response.json();
  pm.test('exactly 3', function () { pm.expect(body.data.posts.length).to.eql(3); });
}
${SCRIPTS.noSecretsInBody}
`.trim())],
      }),
      getReq('Cache Metadata', {
        pathSegments,
        query: [pageQ, { key: 'limit', value: '10' }],
        events: [event('test', `
const prevAt = pm.collectionVariables.get('${fetchedVar}');
if (!prevAt) {
  pm.test('skipped', function () { pm.expect(true).to.eql(true); });
} else {
  pm.test('HTTP 200', function () { pm.response.to.have.status(200); });
  ${SCRIPTS.assertSuccessSchema}
  const body = pm.response.json();
  pm.test('fetched_at stable on cache', function () {
    pm.expect(body.meta.source).to.eql('cache');
    pm.expect(body.meta.fetched_at).to.eql(prevAt);
    pm.expect(body.meta.stale).to.eql(false);
  });
}
${SCRIPTS.noSecretsInBody}
`.trim())],
      }),
      getReq('Cache Post Identity', {
        pathSegments,
        query: [pageQ, { key: 'limit', value: '10' }],
        events: [event('test', `
const prev = (pm.collectionVariables.get('${idVar}') || '').split(',').filter(Boolean);
if (!prev.length) {
  pm.test('skipped', function () { pm.expect(true).to.eql(true); });
} else {
  pm.test('HTTP 200', function () { pm.response.to.have.status(200); });
  ${SCRIPTS.assertSuccessSchema}
  const body = pm.response.json();
  pm.test('IDs unchanged', function () {
    pm.expect(body.data.posts.map(function (p) { return p.id; })).to.eql(prev);
  });
}
${SCRIPTS.noSecretsInBody}
`.trim())],
      }),
    ],
  );
}

function buildFacebookErrors() {
  const path = ['api', 'v1', 'facebook', 'posts'];
  return folder('FB — 04 Validation & Errors', 'SAFE. Negative tests — no successful scrape expected.', [
    getReq('Missing Page Parameter', {
      pathSegments: path,
      query: [{ key: 'limit', value: '10' }],
      events: [event('test', `
pm.test('status 400', function () { pm.response.to.have.status(400); });
${SCRIPTS.assertError}
pm.test('MISSING_PAGE', function () { pm.expect(pm.response.json().error.code).to.eql('MISSING_PAGE'); });
${SCRIPTS.noSecretsInBody}
`.trim())],
    }),
    getReq('Invalid Facebook URL (groups)', {
      pathSegments: path,
      query: [{ key: 'page', value: 'https://www.facebook.com/groups/123' }, { key: 'limit', value: '10' }],
      events: [event('test', `
pm.test('status 400', function () { pm.response.to.have.status(400); });
${SCRIPTS.assertError}
pm.test('INVALID_PAGE_URL', function () { pm.expect(pm.response.json().error.code).to.eql('INVALID_PAGE_URL'); });
${SCRIPTS.noSecretsInBody}
`.trim())],
    }),
    getReq('Unsupported Domain', {
      pathSegments: path,
      query: [{ key: 'page', value: 'https://example.com/cern' }, { key: 'limit', value: '10' }],
      events: [event('test', `
pm.test('status 400', function () { pm.response.to.have.status(400); });
${SCRIPTS.assertError}
pm.test('INVALID_PAGE_URL', function () { pm.expect(pm.response.json().error.code).to.eql('INVALID_PAGE_URL'); });
${SCRIPTS.noSecretsInBody}
`.trim())],
    }),
    getReq('Unauthorized Facebook Page', {
      pathSegments: path,
      query: [{ key: 'page', value: '{{unauthorizedFacebookPageUrl}}' }, { key: 'limit', value: '10' }],
      description: 'Requires scoped apiKey that cannot access unauthorizedFacebookPageUrl (offline runner configures this).',
      events: [event('test', `
pm.test('status 403', function () { pm.response.to.have.status(403); });
${SCRIPTS.assertError}
pm.test('PAGE_NOT_ALLOWED', function () { pm.expect(pm.response.json().error.code).to.eql('PAGE_NOT_ALLOWED'); });
${SCRIPTS.noSecretsInBody}
`.trim())],
    }),
    getReq('Limit Boundary Clamp', {
      pathSegments: path,
      query: [{ key: 'page', value: '{{facebookPageUrl}}' }, { key: 'limit', value: '999' }],
      events: [event('test', `
pm.test('status 200 (clamped, not 400) or 502/403', function () {
  pm.expect([200, 403, 502]).to.include(pm.response.code);
});
if (pm.response.code === 200) {
  ${SCRIPTS.assertSuccessSchema}
  pm.test('limit clamped to 10', function () { pm.expect(pm.response.json().meta.limit).to.eql(10); });
}
${SCRIPTS.noSecretsInBody}
`.trim())],
    }),
    getReq('Unsupported HTTP Method', {
      pathSegments: path,
      method: 'POST',
      query: [{ key: 'page', value: '{{facebookPageUrl}}' }, { key: 'limit', value: '10' }],
      events: [event('test', `
pm.test('status 405', function () { pm.response.to.have.status(405); });
${SCRIPTS.assertError}
pm.test('METHOD_NOT_ALLOWED', function () { pm.expect(pm.response.json().error.code).to.eql('METHOD_NOT_ALLOWED'); });
${SCRIPTS.noSecretsInBody}
`.trim())],
    }),
    getReq('Unknown API Route', {
      pathSegments: ['api', 'v1', 'unknown'],
      query: [],
      events: [event('test', `
pm.test('status 404', function () { pm.response.to.have.status(404); });
${SCRIPTS.assertError}
pm.test('NOT_FOUND', function () { pm.expect(pm.response.json().error.code).to.eql('NOT_FOUND'); });
${SCRIPTS.noSecretsInBody}
`.trim())],
    }),
  ]);
}

function buildInstagramErrors() {
  const path = ['api', 'v1', 'instagram', 'posts'];
  return folder('IG — 04 Validation & Errors', 'SAFE. Negative Instagram validation.', [
    getReq('Missing Profile Parameter', {
      pathSegments: path,
      query: [{ key: 'limit', value: '10' }],
      events: [event('test', `
pm.test('status 400', function () { pm.response.to.have.status(400); });
${SCRIPTS.assertError}
pm.test('MISSING_PAGE', function () { pm.expect(pm.response.json().error.code).to.eql('MISSING_PAGE'); });
${SCRIPTS.noSecretsInBody}
`.trim())],
    }),
    getReq('Post URL Instead of Profile', {
      pathSegments: path,
      query: [{ key: 'page', value: 'https://www.instagram.com/p/ABC123/' }, { key: 'limit', value: '3' }],
      events: [event('test', `
pm.test('status 400', function () { pm.response.to.have.status(400); });
${SCRIPTS.assertError}
pm.test('INVALID_PAGE_URL', function () { pm.expect(pm.response.json().error.code).to.eql('INVALID_PAGE_URL'); });
${SCRIPTS.noSecretsInBody}
`.trim())],
    }),
    getReq('Reel URL Instead of Profile', {
      pathSegments: path,
      query: [{ key: 'page', value: 'https://www.instagram.com/reel/ABC123/' }, { key: 'limit', value: '3' }],
      events: [event('test', `
pm.test('status 400', function () { pm.response.to.have.status(400); });
${SCRIPTS.assertError}
pm.test('INVALID_PAGE_URL', function () { pm.expect(pm.response.json().error.code).to.eql('INVALID_PAGE_URL'); });
${SCRIPTS.noSecretsInBody}
`.trim())],
    }),
    getReq('Unsupported Domain', {
      pathSegments: path,
      query: [{ key: 'page', value: 'https://example.com/nasa' }, { key: 'limit', value: '3' }],
      events: [event('test', `
pm.test('status 400', function () { pm.response.to.have.status(400); });
${SCRIPTS.assertError}
pm.test('INVALID_PAGE_URL', function () { pm.expect(pm.response.json().error.code).to.eql('INVALID_PAGE_URL'); });
${SCRIPTS.noSecretsInBody}
`.trim())],
    }),
    getReq('Unauthorized Instagram Profile', {
      pathSegments: path,
      query: [{ key: 'page', value: '{{unauthorizedInstagramProfileUrl}}' }, { key: 'limit', value: '3' }],
      description: 'Requires scoped apiKey without access to unauthorizedInstagramProfileUrl.',
      events: [event('test', `
pm.test('status 403', function () { pm.response.to.have.status(403); });
${SCRIPTS.assertError}
pm.test('PAGE_NOT_ALLOWED', function () { pm.expect(pm.response.json().error.code).to.eql('PAGE_NOT_ALLOWED'); });
${SCRIPTS.noSecretsInBody}
`.trim())],
    }),
    getReq('Invalid Limit (clamped)', {
      pathSegments: path,
      query: [{ key: 'page', value: '{{instagramProfileUrl}}' }, { key: 'limit', value: '999' }],
      events: [event('test', `
pm.test('status 200/403/502 (invalid limit is clamped, not 400)', function () {
  pm.expect([200, 403, 502]).to.include(pm.response.code);
});
if (pm.response.code === 200) {
  ${SCRIPTS.assertSuccessSchema}
  pm.test('limit clamped to 10', function () { pm.expect(pm.response.json().meta.limit).to.eql(10); });
}
${SCRIPTS.noSecretsInBody}
`.trim())],
    }),
    getReq('Missing API Key', {
      pathSegments: path,
      auth: false,
      query: [{ key: 'page', value: '{{instagramProfileUrl}}' }, { key: 'limit', value: '3' }],
      events: [event('test', `
pm.test('status 401', function () { pm.response.to.have.status(401); });
${SCRIPTS.assertError}
pm.test('UNAUTHORIZED', function () { pm.expect(pm.response.json().error.code).to.eql('UNAUTHORIZED'); });
${SCRIPTS.noSecretsInBody}
`.trim())],
    }),
    getReq('Invalid API Key', {
      pathSegments: path,
      auth: false,
      headers: [{ key: 'x-api-key', value: '{{invalidApiKey}}', type: 'text' }],
      query: [{ key: 'page', value: '{{instagramProfileUrl}}' }, { key: 'limit', value: '3' }],
      events: [event('test', `
pm.test('status 401', function () { pm.response.to.have.status(401); });
${SCRIPTS.assertError}
pm.test('UNAUTHORIZED', function () { pm.expect(pm.response.json().error.code).to.eql('UNAUTHORIZED'); });
${SCRIPTS.noSecretsInBody}
`.trim())],
    }),
    getReq('Unsupported HTTP Method', {
      pathSegments: path,
      method: 'POST',
      query: [{ key: 'page', value: '{{instagramProfileUrl}}' }, { key: 'limit', value: '3' }],
      events: [event('test', `
pm.test('status 405', function () { pm.response.to.have.status(405); });
${SCRIPTS.assertError}
pm.test('METHOD_NOT_ALLOWED', function () { pm.expect(pm.response.json().error.code).to.eql('METHOD_NOT_ALLOWED'); });
${SCRIPTS.noSecretsInBody}
`.trim())],
    }),
    getReq('Unknown API Route', {
      pathSegments: ['api', 'v1', 'instagram', 'unknown'],
      query: [],
      events: [event('test', `
pm.test('status 404', function () { pm.response.to.have.status(404); });
${SCRIPTS.assertError}
pm.test('NOT_FOUND', function () { pm.expect(pm.response.json().error.code).to.eql('NOT_FOUND'); });
${SCRIPTS.noSecretsInBody}
`.trim())],
    }),
  ]);
}

function buildFacebookAuthz() {
  const path = ['api', 'v1', 'facebook', 'posts'];
  return folder('FB — 05 Client Permissions', 'SAFE when scopes configured (offline runner). Multi-client isolation.', [
    getReq('Client A → authorized Facebook page', {
      pathSegments: path,
      query: [{ key: 'page', value: '{{facebookPageUrl}}' }, { key: 'limit', value: '3' }],
      events: [event('test', `
pm.test('status 200 or 502', function () { pm.expect([200, 502]).to.include(pm.response.code); });
if (pm.response.code === 200) { ${SCRIPTS.assertSuccessSchema} }
${SCRIPTS.noSecretsInBody}
`.trim())],
    }),
    getReq('Client A → unauthorized Facebook page', {
      pathSegments: path,
      query: [{ key: 'page', value: '{{unauthorizedFacebookPageUrl}}' }, { key: 'limit', value: '3' }],
      events: [event('test', `
pm.test('status 403', function () { pm.response.to.have.status(403); });
${SCRIPTS.assertError}
pm.test('PAGE_NOT_ALLOWED', function () { pm.expect(pm.response.json().error.code).to.eql('PAGE_NOT_ALLOWED'); });
${SCRIPTS.noSecretsInBody}
`.trim())],
    }),
    getReq('Client B → authorized for unauthorizedFacebookPageUrl', {
      pathSegments: path,
      auth: false,
      headers: [{ key: 'x-api-key', value: '{{apiKeyB}}', type: 'text' }],
      query: [{ key: 'page', value: '{{unauthorizedFacebookPageUrl}}' }, { key: 'limit', value: '3' }],
      events: [event('test', `
const keyB = pm.environment.get('apiKeyB') || '';
if (!keyB) {
  pm.test('skipped when apiKeyB empty', function () { pm.expect(true).to.eql(true); });
} else {
  pm.test('status 200 or 502', function () { pm.expect([200, 502]).to.include(pm.response.code); });
}
${SCRIPTS.noSecretsInBody}
`.trim())],
    }),
    getReq('Client B → denied facebookPageUrl', {
      pathSegments: path,
      auth: false,
      headers: [{ key: 'x-api-key', value: '{{apiKeyB}}', type: 'text' }],
      query: [{ key: 'page', value: '{{facebookPageUrl}}' }, { key: 'limit', value: '3' }],
      events: [event('test', `
const keyB = pm.environment.get('apiKeyB') || '';
if (!keyB) {
  pm.test('skipped when apiKeyB empty', function () { pm.expect(true).to.eql(true); });
} else {
  pm.test('status 403', function () { pm.response.to.have.status(403); });
  ${SCRIPTS.assertError}
}
${SCRIPTS.noSecretsInBody}
`.trim())],
    }),
  ]);
}

function buildInstagramAuthz() {
  const path = ['api', 'v1', 'instagram', 'posts'];
  return folder('IG — 05 Client Permissions', 'SAFE when scopes configured. Cross-client Instagram isolation.', [
    getReq('Client A → authorized Instagram profile', {
      pathSegments: path,
      query: [{ key: 'page', value: '{{instagramProfileUrl}}' }, { key: 'limit', value: '3' }],
      events: [event('test', `
pm.test('status 200 or 502', function () { pm.expect([200, 502]).to.include(pm.response.code); });
if (pm.response.code === 200) { ${SCRIPTS.assertSuccessSchema} }
${SCRIPTS.noSecretsInBody}
`.trim())],
    }),
    getReq('Client A → unauthorized Instagram profile', {
      pathSegments: path,
      query: [{ key: 'page', value: '{{unauthorizedInstagramProfileUrl}}' }, { key: 'limit', value: '3' }],
      events: [event('test', `
pm.test('status 403', function () { pm.response.to.have.status(403); });
${SCRIPTS.assertError}
pm.test('PAGE_NOT_ALLOWED', function () { pm.expect(pm.response.json().error.code).to.eql('PAGE_NOT_ALLOWED'); });
${SCRIPTS.noSecretsInBody}
`.trim())],
    }),
    getReq('Client B → authorized unauthorizedInstagramProfileUrl', {
      pathSegments: path,
      auth: false,
      headers: [{ key: 'x-api-key', value: '{{apiKeyB}}', type: 'text' }],
      query: [{ key: 'page', value: '{{unauthorizedInstagramProfileUrl}}' }, { key: 'limit', value: '3' }],
      events: [event('test', `
const keyB = pm.environment.get('apiKeyB') || '';
if (!keyB) {
  pm.test('skipped when apiKeyB empty', function () { pm.expect(true).to.eql(true); });
} else {
  pm.test('status 200 or 502', function () { pm.expect([200, 502]).to.include(pm.response.code); });
}
${SCRIPTS.noSecretsInBody}
`.trim())],
    }),
    getReq('Client B → denied instagramProfileUrl', {
      pathSegments: path,
      auth: false,
      headers: [{ key: 'x-api-key', value: '{{apiKeyB}}', type: 'text' }],
      query: [{ key: 'page', value: '{{instagramProfileUrl}}' }, { key: 'limit', value: '3' }],
      events: [event('test', `
const keyB = pm.environment.get('apiKeyB') || '';
if (!keyB) {
  pm.test('skipped when apiKeyB empty', function () { pm.expect(true).to.eql(true); });
} else {
  pm.test('status 403', function () { pm.response.to.have.status(403); });
  ${SCRIPTS.assertError}
}
${SCRIPTS.noSecretsInBody}
`.trim())],
    }),
  ]);
}

function buildResilience(prefix, pageVar, pathSegments, coldPage) {
  const pageQ = { key: 'page', value: `{{${pageVar}}}` };
  const idVar = `${prefix.toLowerCase()}ResilienceIds`;
  return folder(
    `${prefix} — 06 Offline Resilience`,
    'SYNTHETIC ONLY. Requires fakeUpstreamUrl (set by npm run postman:offline). Never real Apify.',
    [
      getReq('Seed cache from fake upstream', {
        pathSegments,
        query: [pageQ, { key: 'limit', value: '10' }],
        events: [
          event('prerequest', modeSet('ok')),
          event('test', `
pm.test('seed 200', function () { pm.response.to.have.status(200); });
${SCRIPTS.assertSuccessSchema}
const body = pm.response.json();
pm.collectionVariables.set('${idVar}', body.data.posts.map(function (p) { return p.id; }).join(','));
${SCRIPTS.noSecretsInBody}
`.trim()),
        ],
      }),
      getReq('Upstream HTTP 500 → cache/stale fallback', {
        pathSegments,
        query: [pageQ, { key: 'limit', value: '10' }],
        events: [
          event('prerequest', modeSet('fail')),
          event('test', `
pm.test('still 200 from cache', function () { pm.response.to.have.status(200); });
${SCRIPTS.assertSuccessSchema}
const body = pm.response.json();
pm.test('source cache or stale-cache', function () {
  pm.expect(['cache', 'stale-cache']).to.include(body.meta.source);
});
pm.test('IDs preserved', function () {
  const prev = (pm.collectionVariables.get('${idVar}') || '').split(',').filter(Boolean);
  pm.expect(body.data.posts.map(function (p) { return p.id; })).to.eql(prev);
});
${SCRIPTS.noSecretsInBody}
`.trim()),
        ],
      }),
      getReq('Empty upstream → cache preserved', {
        pathSegments,
        query: [pageQ, { key: 'limit', value: '10' }],
        events: [
          event('prerequest', modeSet('empty')),
          event('test', `
pm.test('200', function () { pm.response.to.have.status(200); });
${SCRIPTS.assertSuccessSchema}
const body = pm.response.json();
pm.test('IDs preserved after empty upstream', function () {
  const prev = (pm.collectionVariables.get('${idVar}') || '').split(',').filter(Boolean);
  pm.expect(body.data.posts.map(function (p) { return p.id; })).to.eql(prev);
});
${SCRIPTS.noSecretsInBody}
`.trim()),
        ],
      }),
      getReq('Cold cache + unavailable upstream → 502', {
        pathSegments,
        query: [{ key: 'page', value: coldPage }, { key: 'limit', value: '5' }],
        events: [
          event('prerequest', modeSet('fail')),
          event('test', `
pm.test('status 502', function () { pm.response.to.have.status(502); });
${SCRIPTS.assertError}
pm.test('UPSTREAM_UNAVAILABLE', function () {
  pm.expect(pm.response.json().error.code).to.eql('UPSTREAM_UNAVAILABLE');
});
${SCRIPTS.noSecretsInBody}
`.trim()),
        ],
      }),
      getReq('Restore fake ok + stable', {
        pathSegments,
        query: [pageQ, { key: 'limit', value: '10' }],
        events: [
          event('prerequest', modeSet('ok')),
          event('test', `
pm.test('200', function () { pm.response.to.have.status(200); });
${SCRIPTS.assertSuccessSchema}
${SCRIPTS.noSecretsInBody}
`.trim()),
        ],
      }),
    ],
  );
}

const collection = {
  info: {
    name: COLLECTION_NAME,
    description:
      'Unified Facebook & Instagram Posts API acceptance suite.\n\n' +
      'Top-level folders:\n' +
      '1. 01 — Facebook\n' +
      '2. 02 — Instagram\n\n' +
      'Safety:\n' +
      '- Offline Resilience subfolders require fakeUpstreamUrl (npm run postman:offline).\n' +
      '- Prefer `npm run postman:serve` (cache-only) for Desktop inspection.\n' +
      '- Real Posts may cost Apify credits if cache is cold — do not Run Collection blindly.\n' +
      '- Default env accounts: public demo Facebook page + Instagram profile (CERN / NASA).\n' +
      '- Never put APIFY_TOKEN in Postman.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: [
    { key: 'fbLastPostIds', value: '' },
    { key: 'fbLastFetchedAt', value: '' },
    { key: 'igLastPostIds', value: '' },
    { key: 'igLastFetchedAt', value: '' },
  ],
  event: [
    event('prerequest', '// Collection prerequest: no paid side effects.'),
    event('test', `
const text = pm.response.text() || '';
pm.test('no obvious secrets in any response body', function () {
  pm.expect(/apify_api_[A-Za-z0-9]+/i.test(text)).to.eql(false);
});
`.trim()),
  ],
  item: [
    folder(
      '01 — Facebook',
      'Facebook page posts API. Default page: {{facebookPageUrl}}.\n' +
        'Endpoint: GET /api/v1/facebook/posts',
      [
        buildHealthAuth('FB', 'facebookPageUrl'),
        buildFacebookRealPosts(),
        buildCacheFolder('FB', 'facebookPageUrl', 'fbLastPostIds', 'fbLastFetchedAt', ['api', 'v1', 'facebook', 'posts']),
        buildFacebookErrors(),
        buildFacebookAuthz(),
        buildResilience('FB', 'facebookPageUrl', ['api', 'v1', 'facebook', 'posts'], 'https://www.facebook.com/SomeNeverCachedPage99'),
      ],
    ),
    folder(
      '02 — Instagram',
      'Instagram profile posts API. Default profile: {{instagramProfileUrl}}.\n' +
        'Endpoint: GET /api/v1/instagram/posts\n' +
        'Cache-only Desktop may return 502 until the profile is present in local cache.',
      [
        buildHealthAuth('IG', 'instagramProfileUrl'),
        buildInstagramRealPosts(),
        buildCacheFolder('IG', 'instagramProfileUrl', 'igLastPostIds', 'igLastFetchedAt', ['api', 'v1', 'instagram', 'posts']),
        buildInstagramErrors(),
        buildInstagramAuthz(),
        buildResilience('IG', 'instagramProfileUrl', ['api', 'v1', 'instagram', 'posts'], 'https://www.instagram.com/SomeNeverCachedProfile99/'),
      ],
    ),
  ],
};

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

const envTemplate = {
  id: 'social-media-posts-local-template',
  name: 'Social Media Posts API — Local (template)',
  values: [
    { key: 'baseUrl', value: 'http://127.0.0.1:3000', type: 'default', enabled: true },
    { key: 'apiKey', value: '', type: 'secret', enabled: true },
    { key: 'apiKeyB', value: '', type: 'secret', enabled: true },
    { key: 'facebookPageUrl', value: FB_DEFAULT, type: 'default', enabled: true },
    { key: 'instagramProfileUrl', value: IG_DEFAULT, type: 'default', enabled: true },
    { key: 'pageUrl', value: FB_DEFAULT, type: 'default', enabled: true },
    { key: 'unauthorizedFacebookPageUrl', value: FB_UNAUTHORIZED_DEFAULT, type: 'default', enabled: true },
    { key: 'unauthorizedInstagramProfileUrl', value: IG_UNAUTHORIZED_DEFAULT, type: 'default', enabled: true },
    { key: 'unauthorizedPageUrl', value: FB_UNAUTHORIZED_DEFAULT, type: 'default', enabled: true },
    { key: 'limit', value: '10', type: 'default', enabled: true },
    { key: 'invalidApiKey', value: 'invalid-key-not-real', type: 'default', enabled: true },
    { key: 'fakeUpstreamUrl', value: '', type: 'default', enabled: true },
  ],
  _postman_variable_scope: 'environment',
  _postman_exported_using: 'fb-posts-api/scripts',
};

export function writePostmanArtifacts() {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(collectionFile, `${JSON.stringify(collection, null, 2)}\n`, 'utf8');
  writeFileSync(envTemplateFile, `${JSON.stringify(envTemplate, null, 2)}\n`, 'utf8');

  let requests = 0;
  let assertions = 0;
  const topFolders = [];
  function walk(items, depth = 0) {
    for (const it of items) {
      if (it.item) {
        if (depth === 0) topFolders.push(it.name);
        walk(it.item, depth + 1);
      } else {
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

  console.log(`Wrote ${collectionFile}`);
  console.log(`Wrote ${envTemplateFile}`);
  console.log(`topFolders=${JSON.stringify(topFolders)}`);
  console.log(`requests=${requests} pm.test_count=${assertions}`);

  if (topFolders.length !== 2 || topFolders[0] !== '01 — Facebook' || topFolders[1] !== '02 — Instagram') {
    throw new Error('expected exactly two top-level folders Facebook then Instagram');
  }
  return { collectionFile, envTemplateFile, topFolders, requests, assertions };
}

if (isDirectRun) {
  try {
    writePostmanArtifacts();
  } catch (e) {
    console.error(`ERROR: ${e.message || e}`);
    process.exit(1);
  }
}
