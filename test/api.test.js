import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/server.js';
import { parsePageRef } from '../src/pageRef.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let mode = 'ok';
let mockUrl;
let mock;

// 12 posts, deliberately unordered, first one is an old "pinned" post.
const items = Array.from({ length: 12 }, (_, i) => ({
  postId: `p${i}`,
  url: `https://www.facebook.com/cern/posts/p${i}`,
  text: `post ${i}`,
  time: new Date(Date.UTC(2026, 9, 20 - i)).toISOString(),
  likes: 10 + i, comments: i, shares: 1,
  pageName: 'CERN',
  user: { id: '123456', name: 'CERN', profilePic: 'https://cdn.example/logo.jpg' },
  media: [{ photo_image: { uri: `https://cdn.example/img${i}.jpg` } }],
}));
items.unshift({ ...items[11], postId: 'pinned', url: 'https://www.facebook.com/cern/posts/pinned', time: '2020-01-01T00:00:00Z' });

before(async () => {
  mock = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      if (mode === 'fail') { res.writeHead(500); return res.end('boom'); }
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify(mode === 'empty' ? [] : items));
    });
  });
  await new Promise((r) => mock.listen(0, '127.0.0.1', r));
  mockUrl = `http://127.0.0.1:${mock.address().port}`;
});
after(() => mock.close());

async function makeApp(extra = {}) {
  const config = loadConfig({
    API_KEYS: 'testsite:secret123',
    APIFY_TOKEN: 'tkn', APIFY_BASE_URL: mockUrl, PROVIDERS: 'apify',
    CACHE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'fbcache-')),
    UPSTREAM_RETRIES: '1', RETRY_BACKOFF_MS: '1', RETRY_COOLDOWN_SECONDS: '0',
    ...extra,
  });
  const server = createApp(config);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (q, headers = { 'x-api-key': 'secret123' }) => {
    const res = await fetch(`${base}/api/v1/facebook/posts?${q}`, { headers });
    return { status: res.status, body: await res.json() };
  };
  return { server, get };
}

test('page URL parsing', () => {
  assert.equal(parsePageRef('https://www.facebook.com/CERN/').key, 'cern');
  assert.equal(parsePageRef('facebook.com/cern?ref=x').url, 'https://www.facebook.com/cern');
  assert.equal(parsePageRef('https://m.facebook.com/profile.php?id=100012345678901').id, '100012345678901');
  assert.equal(parsePageRef('https://www.facebook.com/pages/My-Page/123456789').id, '123456789');
  assert.equal(parsePageRef('https://evil.com/cern'), null);
  assert.equal(parsePageRef('https://www.facebook.com/groups/123'), null);
  assert.equal(parsePageRef('not a url at all'), null);
});

test('auth, validation, live fetch, then cache hit', async () => {
  mode = 'ok';
  const { server, get } = await makeApp({ FRESH_TTL_SECONDS: '3600' });
  try {
    assert.equal((await get('page=https://facebook.com/cern', {})).status, 401);
    assert.equal((await get('page=https://facebook.com/cern', { 'x-api-key': 'wrong' })).status, 401);
    assert.equal((await get('')).status, 400);
    assert.equal((await get('page=https://example.com/x')).status, 400);

    const a = await get('page=https://www.facebook.com/cern');
    assert.equal(a.status, 200);
    assert.equal(a.body.success, true);
    assert.equal(a.body.meta.source, 'live');
    assert.equal(a.body.data.posts.length, 10);
    assert.equal(a.body.data.posts[0].id, 'p0');                 // newest first, pinned old post pushed down
    for (const p of a.body.data.posts) {
      assert.equal(p.page.name, 'CERN');
      assert.equal(p.page.logo, 'https://cdn.example/logo.jpg');
      assert.ok(p.created_at && p.image && p.url);
    }
    const b = await get('page=https://www.facebook.com/cern&limit=3');
    assert.equal(b.body.meta.source, 'cache');
    assert.equal(b.body.data.posts.length, 3);
  } finally { server.close(); }
});

test('upstream failure or empty result falls back to cached posts (never empty)', async () => {
  mode = 'ok';
  const { server, get } = await makeApp({ FRESH_TTL_SECONDS: '0' }); // everything is immediately stale
  try {
    assert.equal((await get('page=https://www.facebook.com/cern')).body.meta.source, 'live');
    await sleep(50);
    mode = 'fail';
    const r = await get('page=https://www.facebook.com/cern');
    assert.equal(r.status, 200);
    assert.equal(r.body.meta.source, 'stale-cache');
    assert.equal(r.body.data.posts.length, 10);
    await sleep(100);
    mode = 'empty';
    const r2 = await get('page=https://www.facebook.com/cern');
    assert.equal(r2.status, 200);
    assert.equal(r2.body.data.posts.length, 10);
    await sleep(100);
    mode = 'ok';
    await get('page=https://www.facebook.com/cern'); // triggers background refresh
    await sleep(100);
    assert.equal((await get('page=https://www.facebook.com/cern')).body.meta.warning, null);
  } finally { server.close(); }
});

test('no cache + upstream down => clean JSON error, not a crash', async () => {
  mode = 'fail';
  const { server, get } = await makeApp();
  try {
    const r = await get('page=https://www.facebook.com/somepage');
    assert.equal(r.status, 502);
    assert.equal(r.body.success, false);
    assert.equal(r.body.error.code, 'UPSTREAM_UNAVAILABLE');
  } finally { server.close(); mode = 'ok'; }
});
