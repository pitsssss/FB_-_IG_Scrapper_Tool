import assert from 'node:assert/strict';

const sameKeys = (obj, expected) => {
  assert.ok(obj && typeof obj === 'object' && !Array.isArray(obj), 'expected plain object');
  const actual = Object.keys(obj).sort();
  const want = [...expected].sort();
  assert.deepEqual(actual, want, `key set mismatch: got [${actual}] want [${want}]`);
};

const isIso = (v) => {
  if (typeof v !== 'string' || !v) return false;
  const d = new Date(v);
  return !Number.isNaN(d.getTime()) && d.toISOString() === v;
};

export function assertPageShape(page, label = 'page') {
  sameKeys(page, ['id', 'name', 'logo', 'logo_fallback', 'url']);
  assert.ok(page.id === null || typeof page.id === 'string', `${label}.id string|null`);
  assert.ok(typeof page.name === 'string' && page.name.trim().length > 0, `${label}.name non-empty`);
  assert.ok(typeof page.logo === 'string' && page.logo.startsWith('https://'), `${label}.logo https`);
  assert.equal(typeof page.logo_fallback, 'string', `${label}.logo_fallback`);
  assert.equal(typeof page.url, 'string', `${label}.url`);
}

export function assertPostShape(post) {
  sameKeys(post, ['id', 'url', 'text', 'created_at', 'image', 'media', 'stats', 'page']);
  assert.ok(typeof post.id === 'string' && post.id.length > 0, 'post.id non-empty');
  assert.ok(post.url === null || typeof post.url === 'string', 'post.url string|null');
  assert.equal(typeof post.text, 'string', 'post.text');
  assert.ok(post.created_at === null || isIso(post.created_at), 'post.created_at ISO|null');
  assert.ok(post.image === null || typeof post.image === 'string', 'post.image string|null');
  assert.ok(Array.isArray(post.media), 'post.media array');
  for (const m of post.media) {
    sameKeys(m, ['type', 'url', 'thumbnail']);
    assert.ok(m.type === 'image' || m.type === 'video', 'media.type');
    assert.equal(typeof m.url, 'string', 'media.url');
    assert.ok(m.thumbnail === null || typeof m.thumbnail === 'string', 'media.thumbnail');
  }
  sameKeys(post.stats, ['likes', 'comments', 'shares']);
  for (const k of ['likes', 'comments', 'shares']) {
    assert.ok(Number.isInteger(post.stats[k]) && post.stats[k] >= 0, `stats.${k}`);
  }
  assertPageShape(post.page, 'post.page');
}

export function assertResponseShape(body) {
  sameKeys(body, ['success', 'data', 'meta']);
  assert.equal(body.success, true);
  sameKeys(body.data, ['page', 'posts']);
  assertPageShape(body.data.page);
  assert.ok(Array.isArray(body.data.posts), 'posts array');
  for (const post of body.data.posts) assertPostShape(post);

  sameKeys(body.meta, [
    'source', 'provider', 'fetched_at', 'cache_age_seconds', 'stale', 'count', 'limit', 'warning',
  ]);
  assert.ok(['live', 'cache', 'stale-cache'].includes(body.meta.source), 'meta.source');
  assert.equal(typeof body.meta.provider, 'string');
  assert.ok(isIso(body.meta.fetched_at), 'meta.fetched_at ISO');
  assert.ok(typeof body.meta.cache_age_seconds === 'number' && body.meta.cache_age_seconds >= 0);
  assert.equal(typeof body.meta.stale, 'boolean');
  assert.equal(body.meta.stale, body.meta.source === 'stale-cache', 'stale === source===stale-cache');
  assert.ok(Number.isInteger(body.meta.count));
  assert.equal(body.meta.count, body.data.posts.length);
  assert.ok(Number.isInteger(body.meta.limit));
  assert.ok(body.meta.warning === null || typeof body.meta.warning === 'string');
}

export function assertErrorShape(body) {
  sameKeys(body, ['success', 'error']);
  assert.equal(body.success, false);
  sameKeys(body.error, ['code', 'message']);
  assert.ok(typeof body.error.code === 'string' && body.error.code.length > 0);
  assert.ok(typeof body.error.message === 'string' && body.error.message.length > 0);
}
