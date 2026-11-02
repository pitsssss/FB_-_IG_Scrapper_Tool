import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.js';
import { createService } from '../src/service.js';
import { createCacheWarmer, parseWarmPageList } from '../src/cacheWarmer.js';
import { createApifyQuota } from '../src/apifyQuota.js';
import { createApp } from '../src/server.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), p));

const items = Array.from({ length: 5 }, (_, i) => ({
  postId: `w${i}`,
  url: `https://www.facebook.com/warmpage/posts/w${i}`,
  text: `warm ${i}`,
  time: new Date(Date.UTC(2026, 9, 20 - i)).toISOString(),
  likes: i, comments: 0, shares: 0,
  facebookId: '111',
  pageName: 'warmpage',
  user: { id: '111', name: 'Warm', profilePic: 'https://cdn.example/w.jpg' },
  media: [{ image: { uri: `https://cdn.example/w${i}.jpg` } }],
}));

describe('cache warmer', () => {
  let mock;
  let mockUrl;
  let mode = 'ok';
  let calls = 0;

  before(async () => {
    mock = http.createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        if (!/run-sync-get-dataset-items/.test(req.url || '')) {
          res.writeHead(404); return res.end('x');
        }
        calls += 1;
        if (mode === 'fail') { res.writeHead(500); return res.end('{"error":"boom"}'); }
        if (mode === 'empty') { res.writeHead(201); return res.end('[]'); }
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end(JSON.stringify(items));
      });
    });
    await new Promise((r) => mock.listen(0, '127.0.0.1', r));
    mockUrl = `http://127.0.0.1:${mock.address().port}`;
  });
  after(() => mock.close());

  function cfg(extra = {}) {
    return loadConfig({
      API_KEYS: 't:secret',
      APIFY_TOKEN: 'tkn',
      APIFY_BASE_URL: mockUrl,
      PROVIDERS: 'apify',
      CACHE_DIR: tmp('fb-warm-'),
      UPSTREAM_RETRIES: '0',
      RETRY_BACKOFF_MS: '1',
      RETRY_COOLDOWN_SECONDS: '60',
      FRESH_TTL_SECONDS: '3600',
      APIFY_DAILY_RUN_LIMIT: '50',
      WARM_STARTUP_DELAY_SECONDS: '0',
      WARM_INTERVAL_SECONDS: '0',
      WARM_CONCURRENCY: '1',
      ...extra,
    });
  }

  it('1: scheduler disabled by default (empty WARM_PAGES)', () => {
    const pages = parseWarmPageList('', {});
    assert.equal(pages.length, 0);
    const config = cfg();
    const service = createService(config);
    const warmer = createCacheWarmer({ config, service, pages });
    assert.equal(warmer.pageCount, 0);
  });

  it('2: one configured page is warmed', async () => {
    mode = 'ok'; calls = 0;
    const config = cfg();
    const pages = parseWarmPageList('https://www.facebook.com/warmone', config);
    const service = createService(config);
    const warmer = createCacheWarmer({ config, service, pages, log() {}, warn() {} });
    const { results } = await warmer.runCycle('t');
    assert.equal(results[0].outcome, 'refreshed');
    assert.equal(calls, 1);
    const body = await service.getPosts(pages[0], 10);
    assert.equal(body.meta.source, 'cache');
    assert.ok(body.data.posts.length >= 1);
  });

  it('3: duplicate URLs for the same page are deduplicated', () => {
    const pages = parseWarmPageList(
      'https://www.facebook.com/CERN/,https://facebook.com/cern,https://www.facebook.com/cern',
      {},
    );
    assert.equal(pages.length, 1);
    assert.equal(pages[0].key, 'cern');
  });

  it('4: fresh cache causes zero outbound requests', async () => {
    mode = 'ok'; calls = 0;
    const config = cfg({ FRESH_TTL_SECONDS: '3600' });
    const pages = parseWarmPageList('https://www.facebook.com/freshy', config);
    const service = createService(config);
    await service.getPosts(pages[0], 10);
    assert.equal(calls, 1);
    const warmer = createCacheWarmer({ config, service, pages, log() {}, warn() {} });
    const { results } = await warmer.runCycle('t');
    assert.equal(results[0].outcome, 'skipped-fresh');
    assert.equal(calls, 1);
  });

  it('5: stale cache triggers refresh', async () => {
    mode = 'ok'; calls = 0;
    const config = cfg({ FRESH_TTL_SECONDS: '0', RETRY_COOLDOWN_SECONDS: '0' });
    const pages = parseWarmPageList('https://www.facebook.com/staleone', config);
    const service = createService(config);
    await service.getPosts(pages[0], 10);
    const before = calls;
    const warmer = createCacheWarmer({ config, service, pages, log() {}, warn() {} });
    const { results } = await warmer.runCycle('t');
    assert.equal(results[0].outcome, 'refreshed');
    assert.ok(calls > before);
  });

  it('6: existing cache survives upstream HTTP 500', async () => {
    mode = 'ok'; calls = 0;
    const config = cfg({ FRESH_TTL_SECONDS: '0', RETRY_COOLDOWN_SECONDS: '0', UPSTREAM_RETRIES: '0' });
    const pages = parseWarmPageList('https://www.facebook.com/keep500', config);
    const service = createService(config);
    const first = await service.getPosts(pages[0], 10);
    const ids = first.data.posts.map((p) => p.id).join(',');
    mode = 'fail';
    const warmer = createCacheWarmer({ config, service, pages, log() {}, warn() {} });
    const { results } = await warmer.runCycle('t');
    assert.equal(results[0].outcome, 'failed');
    const again = await service.getPosts(pages[0], 10);
    assert.equal(again.data.posts.map((p) => p.id).join(','), ids);
    assert.ok(again.data.posts.length > 0);
  });

  it('7: existing cache survives upstream empty results', async () => {
    mode = 'ok'; calls = 0;
    const config = cfg({ FRESH_TTL_SECONDS: '0', RETRY_COOLDOWN_SECONDS: '0', UPSTREAM_RETRIES: '0' });
    const pages = parseWarmPageList('https://www.facebook.com/keepempty', config);
    const service = createService(config);
    const first = await service.getPosts(pages[0], 10);
    const ids = first.data.posts.map((p) => p.id).join(',');
    mode = 'empty';
    const warmer = createCacheWarmer({ config, service, pages, log() {}, warn() {} });
    const { results } = await warmer.runCycle('t');
    assert.equal(results[0].outcome, 'failed');
    const again = await service.getPosts(pages[0], 10);
    assert.equal(again.data.posts.map((p) => p.id).join(','), ids);
  });

  it('8: exhausted Apify budget prevents extra calls', async () => {
    let localCalls = 0;
    const local = http.createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        localCalls += 1;
        res.writeHead(201, { 'content-type': 'application/json' });
        res.end(JSON.stringify(items));
      });
    });
    await new Promise((r) => local.listen(0, '127.0.0.1', r));
    try {
      const localUrl = `http://127.0.0.1:${local.address().port}`;
      const config = cfg({
        APIFY_BASE_URL: localUrl,
        APIFY_DAILY_RUN_LIMIT: '1',
        FRESH_TTL_SECONDS: '3600',
        RETRY_COOLDOWN_SECONDS: '0',
        UPSTREAM_RETRIES: '0',
      });
      assert.equal(config.apify.dailyRunLimit, 1);
      assert.equal(config.retries, 0);
      const pages = parseWarmPageList('https://www.facebook.com/quota1,https://www.facebook.com/quota2', config);
      const service = createService(config);
      await service.getPosts(pages[0], 10);
      assert.equal(localCalls, 1);
      const afterFirst = await createApifyQuota({ stateDir: config.cacheDir, dailyLimit: 1 }).getStatus();
      assert.equal(afterFirst.consumed, 1);
      const warmer = createCacheWarmer({ config, service, pages, log() {}, warn() {} });
      const { results } = await warmer.runCycle('t');
      assert.equal(results.find((r) => r.key === 'quota1')?.outcome, 'skipped-fresh');
      assert.equal(results.find((r) => r.key === 'quota2')?.outcome, 'failed');
      const q = await createApifyQuota({ stateDir: config.cacheDir, dailyLimit: 1 }).getStatus();
      assert.equal(q.consumed, 1);
      assert.equal(localCalls, 1);
    } finally {
      local.close();
    }
  });

  it('9: restart does not refresh still-fresh cache', async () => {
    mode = 'ok'; calls = 0;
    const dir = tmp('fb-warm-persist-');
    const config = cfg({ CACHE_DIR: dir, FRESH_TTL_SECONDS: '3600' });
    const pages = parseWarmPageList('https://www.facebook.com/persistwarm', config);
    const service1 = createService(config);
    await service1.getPosts(pages[0], 10);
    assert.equal(calls, 1);
    const service2 = createService(cfg({ CACHE_DIR: dir, FRESH_TTL_SECONDS: '3600' }));
    const warmer = createCacheWarmer({
      config: cfg({ CACHE_DIR: dir, FRESH_TTL_SECONDS: '3600' }),
      service: service2,
      pages,
      log() {},
      warn() {},
    });
    const { results } = await warmer.runCycle('t');
    assert.equal(results[0].outcome, 'skipped-fresh');
    assert.equal(calls, 1);
  });

  it('10: concurrent public requests and warming share the same refresh', async () => {
    mode = 'ok'; calls = 0;
    const config = cfg({ FRESH_TTL_SECONDS: '0', RETRY_COOLDOWN_SECONDS: '0' });
    // use a never-seen page so both paths call refresh together
    const pages = parseWarmPageList('https://www.facebook.com/sharedflight', config);
    const service = createService(config);
    const warmer = createCacheWarmer({ config, service, pages, log() {}, warn() {} });
    const [a, b, warmResult] = await Promise.all([
      service.getPosts(pages[0], 10),
      service.getPosts(pages[0], 10),
      warmer.runCycle('t'),
    ]);
    assert.equal(a.success, true);
    assert.ok(a.data.posts.length);
    assert.deepEqual(a.data.posts.map((p) => p.id), b.data.posts.map((p) => p.id));
    assert.equal(calls, 1);
    assert.ok(warmResult.results[0] && ['refreshed', 'skipped-fresh'].includes(warmResult.results[0].outcome));
  });

  it('11: a page in retry cooldown is skipped', async () => {
    mode = 'fail'; calls = 0;
    const config = cfg({ RETRY_COOLDOWN_SECONDS: '60', FRESH_TTL_SECONDS: '0', UPSTREAM_RETRIES: '0' });
    const pages = parseWarmPageList('https://www.facebook.com/cooldown', config);
    const service = createService(config);
    await assert.rejects(() => service.getPosts(pages[0], 10));
    const before = calls;
    const warmer = createCacheWarmer({ config, service, pages, log() {}, warn() {} });
    const { results } = await warmer.runCycle('t');
    assert.equal(results[0].outcome, 'skipped-cooldown');
    assert.equal(calls, before);
  });

  it('12: failed warming does not crash the API process', async () => {
    mode = 'fail';
    const config = cfg({ RETRY_COOLDOWN_SECONDS: '0', UPSTREAM_RETRIES: '0' });
    const pages = parseWarmPageList('https://www.facebook.com/nocachefail', config);
    const service = createService(config);
    const server = createApp(config, service);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const warmer = createCacheWarmer({ config, service, pages, log() {}, warn() {} });
      const { results } = await warmer.runCycle('t');
      assert.equal(results[0].outcome, 'failed');
      const res = await fetch(`http://127.0.0.1:${server.address().port}/health`);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { status: 'ok' });
    } finally {
      server.close();
    }
  });

  it('13: scheduler stops on shutdown', async () => {
    mode = 'ok';
    const config = cfg({ WARM_INTERVAL_SECONDS: '3600', WARM_STARTUP_DELAY_SECONDS: '60' });
    const pages = parseWarmPageList('https://www.facebook.com/stopme', config);
    const service = createService(config);
    const warmer = createCacheWarmer({ config, service, pages, log() {}, warn() {} });
    warmer.start();
    await warmer.stop();
    assert.equal(warmer.stopped, true);
    const { ran } = await warmer.runCycle('after-stop');
    assert.equal(ran, false);
  });

  it('14: periodic cycles do not overlap', async () => {
    mode = 'ok';
    let inFlight = 0;
    let maxInFlight = 0;
    const config = cfg({ FRESH_TTL_SECONDS: '0', RETRY_COOLDOWN_SECONDS: '0' });
    const pages = parseWarmPageList('https://www.facebook.com/overlap1,https://www.facebook.com/overlap2', config);
    const base = createService(config);
    const service = {
      warm: async (ref) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await sleep(30);
        const out = await base.warm(ref);
        inFlight -= 1;
        return out;
      },
    };
    const warmer = createCacheWarmer({ config: { ...config, warmConcurrency: 1 }, service, pages, log() {}, warn() {} });
    const p1 = warmer.runCycle('a');
    const p2 = warmer.runCycle('b');
    const [r1, r2] = await Promise.all([p1, p2]);
    assert.equal(r1.ran || r2.ran, true);
    assert.equal(r1.ran && r2.ran, false); // one skipped due to overlap guard
    assert.ok(maxInFlight <= 1);
  });

  it('15: invalid or disallowed WARM_PAGES are rejected', () => {
    assert.throws(() => parseWarmPageList('https://example.com/x', {}), /invalid/);
    assert.throws(
      () => parseWarmPageList('https://www.facebook.com/cern', { allowedPages: ['other'] }),
      /ALLOWED_PAGES/,
    );
  });

  it('16: WARM_CONCURRENCY is respected', async () => {
    mode = 'ok';
    let inFlight = 0;
    let maxInFlight = 0;
    const config = cfg({
      FRESH_TTL_SECONDS: '0',
      RETRY_COOLDOWN_SECONDS: '0',
      WARM_CONCURRENCY: '2',
    });
    assert.equal(config.warmConcurrency, 2);
    const pages = parseWarmPageList(
      'https://www.facebook.com/c1,https://www.facebook.com/c2,https://www.facebook.com/c3,https://www.facebook.com/c4',
      config,
    );
    const base = createService(config);
    const service = {
      warm: async (ref) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await sleep(40);
        const out = await base.warm(ref);
        inFlight -= 1;
        return out;
      },
    };
    const warmer = createCacheWarmer({ config, service, pages, log() {}, warn() {} });
    await warmer.runCycle('conc');
    assert.ok(maxInFlight <= 2, `maxInFlight=${maxInFlight}`);
    assert.ok(maxInFlight >= 2, `expected parallelism, maxInFlight=${maxInFlight}`);
  });
});
