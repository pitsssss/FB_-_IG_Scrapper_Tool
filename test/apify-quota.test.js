import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.js';
import { createApifyQuota } from '../src/apifyQuota.js';
import { createApifyProvider, buildApifyRunUrl } from '../src/providers/apify.js';
import { createService } from '../src/service.js';

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const sampleItems = [
  {
    postId: 'q1',
    url: 'https://www.facebook.com/cern/posts/q1',
    text: 'quota test',
    time: '2026-10-20T00:00:00.000Z',
    likes: 1,
    comments: 0,
    shares: 0,
    facebookId: '123',
    pageName: 'cern',
    user: { id: '123', name: 'CERN', profilePic: 'https://cdn.example/l.jpg' },
    media: [{ image: { uri: 'https://cdn.example/i.jpg' } }],
  },
];

describe('apify quota manager', () => {
  it('1-3: first and last succeed, next blocked', async () => {
    const dir = tmpDir('fb-q-');
    const q = createApifyQuota({ stateDir: dir, dailyLimit: 2 });
    const a = await q.reserve();
    assert.equal(a.ok, true);
    assert.equal(a.consumed, 1);
    const b = await q.reserve();
    assert.equal(b.ok, true);
    assert.equal(b.consumed, 2);
    const c = await q.reserve();
    assert.equal(c.ok, false);
    assert.equal(c.reason, 'quota_exhausted');
  });

  it('4: concurrent reservations cannot exceed the limit', async () => {
    const dir = tmpDir('fb-q-');
    const q = createApifyQuota({ stateDir: dir, dailyLimit: 5 });
    const results = await Promise.all(Array.from({ length: 20 }, () => q.reserve()));
    const ok = results.filter((r) => r.ok);
    const denied = results.filter((r) => !r.ok);
    assert.equal(ok.length, 5);
    assert.equal(denied.length, 15);
    const status = await q.getStatus();
    assert.equal(status.consumed, 5);
  });

  it('5: counts persist across new quota manager instances', async () => {
    const dir = tmpDir('fb-q-');
    const q1 = createApifyQuota({ stateDir: dir, dailyLimit: 10 });
    await q1.reserve();
    await q1.reserve();
    const q2 = createApifyQuota({ stateDir: dir, dailyLimit: 10 });
    const s = await q2.getStatus();
    assert.equal(s.consumed, 2);
    const r = await q2.reserve();
    assert.equal(r.consumed, 3);
  });

  it('6: UTC midnight resets the daily count', async () => {
    const dir = tmpDir('fb-q-');
    let t = Date.UTC(2026, 10, 2, 23, 0, 0);
    const q = createApifyQuota({ stateDir: dir, dailyLimit: 3, now: () => t });
    await q.reserve();
    await q.reserve();
    assert.equal((await q.getStatus()).consumed, 2);
    t = Date.UTC(2026, 10, 3, 0, 0, 1);
    const r = await q.reserve();
    assert.equal(r.ok, true);
    assert.equal(r.consumed, 1);
    assert.equal(r.utcDate, '2026-11-03');
  });

  it('7: changing configured limit does not erase consumption', async () => {
    const dir = tmpDir('fb-q-');
    const q1 = createApifyQuota({ stateDir: dir, dailyLimit: 10 });
    await q1.reserve();
    await q1.reserve();
    await q1.reserve();
    const q2 = createApifyQuota({ stateDir: dir, dailyLimit: 100 });
    const s = await q2.getStatus();
    assert.equal(s.consumed, 3);
    assert.equal(s.dailyLimit, 100);
    assert.equal(s.remaining, 97);
  });

  it('8: zero limit blocks all Apify invocations', async () => {
    const dir = tmpDir('fb-q-');
    const q = createApifyQuota({ stateDir: dir, dailyLimit: 0 });
    const r = await q.reserve();
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'quota_disabled');
  });

  it('9: corrupted state fails closed', async () => {
    const dir = tmpDir('fb-q-');
    await fsp.writeFile(path.join(dir, 'apify-quota.json'), '{not-json', 'utf8');
    const q = createApifyQuota({ stateDir: dir, dailyLimit: 5 });
    const r = await q.reserve();
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'quota_untrusted');
    const s = await q.getStatus();
    assert.equal(s.readable, false);
  });

  it('10: unwritable storage prevents outbound Apify requests', async () => {
    const dir = tmpDir('fb-q-');
    // A directory occupying the quota filename makes read/write impossible (fail-closed).
    const blocker = path.join(dir, 'apify-quota.json');
    await fsp.mkdir(blocker);
    const q = createApifyQuota({ stateDir: dir, dailyLimit: 5 });
    const r = await q.reserve();
    assert.equal(r.ok, false);
    assert.ok(
      r.reason === 'quota_persist_failed' || r.reason === 'quota_untrusted',
      `expected fail-closed reason, got ${r.reason}`,
    );
  });
});

describe('apify provider quota integration', () => {
  let mock;
  let mockUrl;
  let mode = 'ok';
  let lastUrl = '';
  let calls = 0;

  before(async () => {
    mock = http.createServer((req, res) => {
      lastUrl = req.url || '';
      req.resume();
      req.on('end', () => {
        if (!/run-sync-get-dataset-items/.test(req.url || '')) {
          res.writeHead(404); return res.end('no');
        }
        calls += 1;
        if (mode === 'fail') { res.writeHead(500); return res.end(JSON.stringify({ error: 'boom' })); }
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end(JSON.stringify(sampleItems));
      });
    });
    await new Promise((r) => mock.listen(0, '127.0.0.1', r));
    mockUrl = `http://127.0.0.1:${mock.address().port}`;
  });
  after(() => mock.close());

  function makeConfig(extra = {}) {
    return loadConfig({
      API_KEYS: 't:secret',
      APIFY_TOKEN: 'tkn',
      APIFY_BASE_URL: mockUrl,
      PROVIDERS: 'apify',
      CACHE_DIR: tmpDir('fb-qc-'),
      UPSTREAM_RETRIES: '0',
      RETRY_BACKOFF_MS: '1',
      RETRY_COOLDOWN_SECONDS: '0',
      APIFY_DAILY_RUN_LIMIT: '2',
      ...extra,
    });
  }

  it('11: failed HTTP invocation still consumes reservation', async () => {
    mode = 'fail';
    calls = 0;
    const config = makeConfig({ APIFY_DAILY_RUN_LIMIT: '3' });
    const provider = createApifyProvider(config);
    await assert.rejects(() => provider.fetch({ key: 'cern', url: 'https://www.facebook.com/cern' }, 10));
    assert.equal(calls, 1);
    const s = await provider.quota.getStatus();
    assert.equal(s.consumed, 1);
  });

  it('12: automatic HTTP retries consume separate reservations', async () => {
    mode = 'fail';
    calls = 0;
    const config = makeConfig({ APIFY_DAILY_RUN_LIMIT: '10', UPSTREAM_RETRIES: '1', RETRY_BACKOFF_MS: '1' });
    const service = createService(config);
    await assert.rejects(() => service.getPosts({ key: 'retryme', slug: 'retryme', url: 'https://www.facebook.com/retryme' }, 10));
    assert.equal(calls, 2); // attempt 0 and 1
    const q = createApifyQuota({ stateDir: config.cacheDir, dailyLimit: 10 });
    assert.equal((await q.getStatus()).consumed, 2);
  });

  it('13: cache hits consume zero reservations', async () => {
    mode = 'ok';
    calls = 0;
    const config = makeConfig({ APIFY_DAILY_RUN_LIMIT: '5', FRESH_TTL_SECONDS: '3600' });
    const service = createService(config);
    const ref = { key: 'cachehit', slug: 'cachehit', url: 'https://www.facebook.com/cachehit' };
    await service.getPosts(ref, 10);
    assert.equal(calls, 1);
    const before = (await createApifyQuota({ stateDir: config.cacheDir, dailyLimit: 5 }).getStatus()).consumed;
    await service.getPosts(ref, 10);
    await service.getPosts(ref, 10);
    assert.equal(calls, 1);
    const after = (await createApifyQuota({ stateDir: config.cacheDir, dailyLimit: 5 }).getStatus()).consumed;
    assert.equal(after, before);
  });

  it('14: graph-only requests consume zero Apify reservations', async () => {
    const dir = tmpDir('fb-qg-');
    const graph = http.createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        const u = new URL(req.url, 'http://x');
        if (u.pathname.endsWith('/posts')) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({
            data: [{
              id: 'g1', message: 'hi', created_time: '2026-01-01T00:00:00+0000',
              permalink_url: 'https://www.facebook.com/x/posts/g1',
              reactions: { summary: { total_count: 1 } },
              comments: { summary: { total_count: 0 } },
              shares: { count: 0 },
            }],
          }));
        } else {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ id: '9', name: 'G', link: 'https://www.facebook.com/graphonly', picture: { data: { url: 'https://cdn.example/g.jpg' } } }));
        }
      });
    });
    await new Promise((r) => graph.listen(0, '127.0.0.1', r));
    const gUrl = `http://127.0.0.1:${graph.address().port}`;
    try {
      const config = loadConfig({
        API_KEYS: 't:secret',
        PROVIDERS: 'graph',
        GRAPH_PAGE_TOKENS: JSON.stringify({ graphonly: 'page-token' }),
        GRAPH_BASE_URL: gUrl,
        CACHE_DIR: dir,
        APIFY_TOKEN: '',
        APIFY_DAILY_RUN_LIMIT: '5',
      });
      const service = createService(config);
      await service.getPosts({ key: 'graphonly', slug: 'graphonly', url: 'https://www.facebook.com/graphonly' }, 10);
      const s = await createApifyQuota({ stateDir: dir, dailyLimit: 5 }).getStatus();
      assert.equal(s.consumed, 0);
    } finally {
      graph.close();
    }
  });

  it('15: optional maxTotalChargeUsd appears in outgoing URL', async () => {
    mode = 'ok';
    calls = 0;
    lastUrl = '';
    const config = makeConfig({ APIFY_DAILY_RUN_LIMIT: '5', APIFY_MAX_CHARGE_USD_PER_RUN: '0.25' });
    assert.match(buildApifyRunUrl(config.apify), /maxTotalChargeUsd=0\.25/);
    const provider = createApifyProvider(config);
    await provider.fetch({ key: 'cern', url: 'https://www.facebook.com/cern' }, 5);
    assert.match(lastUrl, /maxTotalChargeUsd=0\.25/);
    assert.match(lastUrl, /format=json/);
    assert.match(lastUrl, /clean=true/);

    const configOff = makeConfig({ APIFY_DAILY_RUN_LIMIT: '5' });
    assert.equal(new URL(buildApifyRunUrl(configOff.apify)).searchParams.has('maxTotalChargeUsd'), false);
  });

  it('16: invalid configuration is rejected', () => {
    assert.throws(() => loadConfig({ API_KEYS: 't:x', APIFY_DAILY_RUN_LIMIT: '-1' }), /APIFY_DAILY_RUN_LIMIT/);
    assert.throws(() => loadConfig({ API_KEYS: 't:x', APIFY_DAILY_RUN_LIMIT: '1.5' }), /APIFY_DAILY_RUN_LIMIT/);
    assert.throws(() => loadConfig({ API_KEYS: 't:x', APIFY_DAILY_RUN_LIMIT: 'abc' }), /APIFY_DAILY_RUN_LIMIT/);
    assert.throws(() => loadConfig({ API_KEYS: 't:x', APIFY_MAX_CHARGE_USD_PER_RUN: '0' }), /APIFY_MAX_CHARGE_USD_PER_RUN/);
    assert.throws(() => loadConfig({ API_KEYS: 't:x', APIFY_MAX_CHARGE_USD_PER_RUN: '-2' }), /APIFY_MAX_CHARGE_USD_PER_RUN/);
    assert.throws(() => loadConfig({ API_KEYS: 't:x', APIFY_MAX_CHARGE_USD_PER_RUN: 'nope' }), /APIFY_MAX_CHARGE_USD_PER_RUN/);
    const ok = loadConfig({ API_KEYS: 't:x' });
    assert.equal(ok.apify.dailyRunLimit, 12);
    assert.equal(ok.apify.maxChargeUsdPerRun, null);
  });
});
