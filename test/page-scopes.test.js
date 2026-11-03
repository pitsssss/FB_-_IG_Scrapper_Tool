import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/server.js';
import { createApifyQuota } from '../src/apifyQuota.js';
import { assertErrorShape, assertResponseShape } from './schema.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fb-scope-'));

const itemsFor = (page) => Array.from({ length: 3 }, (_, i) => ({
  postId: `${page}-${i}`,
  url: `https://www.facebook.com/${page}/posts/${i}`,
  text: `${page} ${i}`,
  time: new Date(Date.UTC(2026, 9, 20 - i)).toISOString(),
  likes: i, comments: 0, shares: 0,
  facebookId: '1',
  pageName: page,
  user: { id: '1', name: page.toUpperCase(), profilePic: 'https://cdn.example/l.jpg' },
  media: [{ image: { uri: `https://cdn.example/${page}${i}.jpg` } }],
}));

describe('per-client page scopes', () => {
  let mock;
  let mockUrl;
  let calls = 0;

  before(async () => {
    mock = http.createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        calls += 1;
        const body = req.url || '';
        // Serve generic items; page identity comes from normalize + ref.
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end(JSON.stringify(itemsFor('x')));
      });
    });
    await new Promise((r) => mock.listen(0, '127.0.0.1', r));
    mockUrl = `http://127.0.0.1:${mock.address().port}`;
  });
  after(() => mock.close());

  const scopes = JSON.stringify({
    website1: ['https://www.facebook.com/pagea'],
    website2: ['https://www.facebook.com/pageb'],
  });

  function cfg(extra = {}) {
    return loadConfig({
      API_KEYS: 'website1:secretA,website2:secretB',
      API_KEY_PAGE_SCOPES: scopes,
      APIFY_TOKEN: 'tkn',
      APIFY_BASE_URL: mockUrl,
      PROVIDERS: 'apify',
      CACHE_DIR: tmp(),
      UPSTREAM_RETRIES: '0',
      RETRY_BACKOFF_MS: '1',
      RETRY_COOLDOWN_SECONDS: '0',
      FRESH_TTL_SECONDS: '3600',
      APIFY_DAILY_RUN_LIMIT: '50',
      ...extra,
    });
  }

  async function start(extra = {}) {
    const config = cfg(extra);
    const server = createApp(config);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${server.address().port}`;
    const get = async (page, key) => {
      const res = await fetch(`${base}/api/v1/facebook/posts?page=${encodeURIComponent(page)}`, {
        headers: key ? { 'x-api-key': key } : {},
      });
      const text = await res.text();
      let body;
      try { body = JSON.parse(text); } catch { body = text; }
      return { status: res.status, body, text };
    };
    return { server, config, get, base };
  }

  it('1-5: two clients with isolated page authorization', async () => {
    calls = 0;
    const { server, get } = await start();
    try {
      const aOk = await get('pagea', 'secretA');
      assert.equal(aOk.status, 200);
      assertResponseShape(aOk.body);

      const aDeny = await get('pageb', 'secretA');
      assert.equal(aDeny.status, 403);
      assertErrorShape(aDeny.body);
      assert.equal(aDeny.body.error.code, 'PAGE_NOT_ALLOWED');
      assert.equal(aDeny.text.includes('website2'), false);
      assert.equal(aDeny.text.includes('secret'), false);

      const bOk = await get('pageb', 'secretB');
      assert.equal(bOk.status, 200);

      const bDeny = await get('pagea', 'secretB');
      assert.equal(bDeny.status, 403);
      assertErrorShape(bDeny.body);
    } finally {
      server.close();
    }
  });

  it('6-8: unauthorized cached and uncached pages denied; no quota burn', async () => {
    const dir = tmp();
    calls = 0;
    const { server, get, config } = await start({ CACHE_DIR: dir, APIFY_DAILY_RUN_LIMIT: '10' });
    try {
      const warm = await get('pagea', 'secretA');
      assert.equal(warm.status, 200);
      const before = calls;
      const qBefore = await createApifyQuota({ stateDir: dir, dailyLimit: 10 }).getStatus();

      const denyCached = await get('pagea', 'secretB');
      assert.equal(denyCached.status, 403);
      const denyFresh = await get('pagec', 'secretA');
      assert.equal(denyFresh.status, 403);

      assert.equal(calls, before);
      const qAfter = await createApifyQuota({ stateDir: dir, dailyLimit: 10 }).getStatus();
      assert.equal(qAfter.consumed, qBefore.consumed);
    } finally {
      server.close();
    }
  });

  it('9-12: scoped-mode config validation', () => {
    assert.throws(
      () => loadConfig({
        API_KEYS: 'website1:secretA,website2:secretB',
        API_KEY_PAGE_SCOPES: JSON.stringify({ website1: ['https://www.facebook.com/pagea'] }),
      }),
      /missing entry/,
    );
    assert.throws(
      () => loadConfig({
        API_KEYS: 'website1:secretA',
        API_KEY_PAGE_SCOPES: JSON.stringify({ website1: ['https://example.com/x'] }),
      }),
      /unsupported page\/profile reference|unsupported page URL|invalid/i,
    );
    assert.throws(
      () => loadConfig({ API_KEYS: 'website1:a,website1:b' }),
      /duplicate client name/,
    );
    assert.throws(
      () => loadConfig({ API_KEYS: 'website1:same,website2:same' }),
      /duplicate secret/,
    );
  });

  it('13: global ALLOWED_PAGES still applies with scopes', async () => {
    const { server, get } = await start({ ALLOWED_PAGES: 'pagea' });
    try {
      assert.equal((await get('pagea', 'secretA')).status, 200);
      // pageb is in website2 scope but blocked globally
      assert.equal((await get('pageb', 'secretB')).status, 403);
    } finally {
      server.close();
    }
  });

  it('14: unscoped configuration remains backward compatible', async () => {
    const config = loadConfig({
      API_KEYS: 'website1:secretA,website2:secretB',
      APIFY_TOKEN: 'tkn',
      APIFY_BASE_URL: mockUrl,
      PROVIDERS: 'apify',
      CACHE_DIR: tmp(),
      UPSTREAM_RETRIES: '0',
    });
    assert.equal(config.pageScopes, null);
    const server = createApp(config);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const res = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/facebook/posts?page=${encodeURIComponent('anyok')}`, {
        headers: { 'x-api-key': 'secretA' },
      });
      assert.equal(res.status, 200);
    } finally {
      server.close();
    }
  });

  it('15: invalid credentials never expose account details', async () => {
    const { server, get } = await start();
    try {
      const missing = await get('pagea', null);
      assert.equal(missing.status, 401);
      assertErrorShape(missing.body);
      assert.equal(missing.text.includes('website1'), false);
      assert.equal(missing.text.includes('secretA'), false);

      const wrong = await get('pagea', 'wrong-key');
      assert.equal(wrong.status, 401);
      assertErrorShape(wrong.body);
      assert.equal(wrong.text.includes('website'), false);

      // Query-string credentials must be ignored
      const res = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/facebook/posts?page=${encodeURIComponent('pagea')}&api_key=secretA&apiKey=secretA`);
      assert.equal(res.status, 401);
    } finally {
      server.close();
    }
  });

  it('16: concurrent authorization isolation', async () => {
    const { server, get } = await start();
    try {
      const results = await Promise.all([
        get('pagea', 'secretA'),
        get('pageb', 'secretA'),
        get('pageb', 'secretB'),
        get('pagea', 'secretB'),
        get('pagea', 'secretA'),
      ]);
      assert.equal(results[0].status, 200);
      assert.equal(results[1].status, 403);
      assert.equal(results[2].status, 200);
      assert.equal(results[3].status, 403);
      assert.equal(results[4].status, 200);
    } finally {
      server.close();
    }
  });
});
