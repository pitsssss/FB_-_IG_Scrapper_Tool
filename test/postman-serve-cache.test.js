/**
 * Synthetic tests for shared Postman live-cache + serve quota CLI.
 * Uses fake upstream only — zero real Apify calls.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFakeUpstream } from '../scripts/fake-upstream.js';
import {
  DEFAULT_LIVE_DAILY_LIMIT,
  MAX_CLI_DAILY_LIMIT,
  parseServeFlags,
  resolveMaxChargeUsd,
  resolveSharedCacheDir,
  SHARED_CACHE_NAME,
} from '../scripts/postman-shared.js';
import { assertResponseShape, assertErrorShape } from './schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close((err) => (err ? reject(err) : resolve(port)));
    });
    s.on('error', reject);
  });
}

async function waitHealth(baseUrl, timeoutMs = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok && (await res.json())?.status === 'ok') return;
    } catch {
      /* retry */
    }
    await sleep(80);
  }
  throw new Error(`health timeout ${baseUrl}`);
}

function spawnApi(env) {
  const child = spawn(process.execPath, [join(root, 'src', 'index.js')], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let logBuf = '';
  child.stdout.on('data', (b) => {
    logBuf += b.toString('utf8');
  });
  child.stderr.on('data', (b) => {
    logBuf += b.toString('utf8');
  });
  child.__log = () => logBuf;
  return child;
}

async function stopChild(child) {
  if (!child || child.killed || child.exitCode !== null) return;
  await new Promise((resolve) => {
    const t = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    }, 3000);
    child.once('exit', () => {
      clearTimeout(t);
      resolve();
    });
    try {
      child.kill('SIGTERM');
    } catch {
      clearTimeout(t);
      resolve();
    }
  });
}

async function fetchPosts(baseUrl, key, page, limit = 10) {
  const res = await fetch(
    `${baseUrl}/api/v1/facebook/posts?page=${encodeURIComponent(page)}&limit=${limit}`,
    { headers: { 'x-api-key': key } },
  );
  const body = await res.json();
  return { status: res.status, body };
}

async function fakeStats(fakeUrl) {
  return (await fetch(`${fakeUrl}/__stats`)).json();
}

describe('postman shared CLI helpers', () => {
  it('resolves shared cache under .postman-local/live-cache', () => {
    assert.equal(SHARED_CACHE_NAME, 'live-cache');
    assert.ok(resolveSharedCacheDir(root).endsWith(join('.postman-local', 'live-cache')));
  });

  it('defaults and validates --daily-limit', () => {
    assert.deepEqual(parseServeFlags(['node', 'x', 'serve']), {
      live: false,
      dailyLimit: 0,
      dailyLimitExplicit: false,
    });
    assert.deepEqual(parseServeFlags(['node', 'x', 'serve', '--live']), {
      live: true,
      dailyLimit: DEFAULT_LIVE_DAILY_LIMIT,
      dailyLimitExplicit: false,
    });
    assert.deepEqual(parseServeFlags(['node', 'x', 'serve', '--live', '--daily-limit=3']), {
      live: true,
      dailyLimit: 3,
      dailyLimitExplicit: true,
    });
    assert.throws(() => parseServeFlags(['node', 'x', 'serve', '--daily-limit=3']), /requires --live/);
    assert.throws(() => parseServeFlags(['node', 'x', 'serve', '--live', '--daily-limit=0']), /1 to/);
    assert.throws(
      () => parseServeFlags(['node', 'x', 'serve', '--live', `--daily-limit=${MAX_CLI_DAILY_LIMIT + 1}`]),
      /1 to/,
    );
    assert.throws(() => parseServeFlags(['node', 'x', 'serve', '--live', '--daily-limit']), /positive integer/);
  });

  it('resolves max charge with lower override', () => {
    assert.equal(resolveMaxChargeUsd({}), '0.15');
    assert.equal(resolveMaxChargeUsd({ APIFY_MAX_CHARGE_USD_PER_RUN: '0.05' }), '0.05');
  });
});

describe('shared cache + quota for Postman serve (synthetic)', () => {
  let fake;
  let fakeUrl;
  let cacheDir;
  const children = [];

  before(async () => {
    cacheDir = await mkdtemp(join(tmpdir(), 'fb-postman-share-'));
    fake = startFakeUpstream({ port: 0, host: '127.0.0.1' });
    const { port } = await fake.ready;
    fakeUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    for (const c of [...children].reverse()) await stopChild(c);
    children.length = 0;
    if (fake) await fake.close();
    await rm(cacheDir, { recursive: true, force: true });
  });

  it('seeds CERN via fake, cache-only restart serves without new upstream, quota preserved', async () => {
    const key = `k${randomBytes(8).toString('hex')}`;
    const port1 = await freePort();
    const api1 = spawnApi({
      HOST: '127.0.0.1',
      PORT: String(port1),
      CACHE_DIR: cacheDir,
      API_KEYS: `gui:${key}`,
      APIFY_TOKEN: 'dummy',
      APIFY_BASE_URL: fakeUrl,
      PROVIDERS: 'apify',
      APIFY_DAILY_RUN_LIMIT: '3',
      UPSTREAM_RETRIES: '0',
      WARM_PAGES: '',
      RATE_LIMIT_PER_MIN: '0',
      MAX_POSTS: '10',
      FRESH_TTL_SECONDS: '3600',
    });
    children.push(api1);
    const base1 = `http://127.0.0.1:${port1}`;
    await waitHealth(base1);

    assert.match(api1.__log(), /cache warmer: disabled/);
    const before = await fakeStats(fakeUrl);
    assert.equal(before.calls, 0, 'no automatic scrape at startup');

    const live = await fetchPosts(base1, key, 'https://www.facebook.com/cern', 10);
    assert.equal(live.status, 200);
    assertResponseShape(live.body);
    assert.equal(live.body.meta.source, 'live');
    assert.equal(live.body.data.posts.length, 10);
    const ids = live.body.data.posts.map((p) => p.id);
    const fetchedAt = live.body.meta.fetched_at;

    const afterLive = await fakeStats(fakeUrl);
    assert.equal(afterLive.calls, before.calls + 1);

    const quota1 = JSON.parse(await readFile(join(cacheDir, 'apify-quota.json'), 'utf8'));
    assert.equal(quota1.consumed, 1);

    await stopChild(api1);
    children.pop();

    // Cache-only Desktop serve equivalent
    const key2 = `k${randomBytes(8).toString('hex')}`;
    const port2 = await freePort();
    const api2 = spawnApi({
      HOST: '127.0.0.1',
      PORT: String(port2),
      CACHE_DIR: cacheDir,
      API_KEYS: `gui:${key2}`,
      APIFY_TOKEN: 'dummy',
      APIFY_BASE_URL: fakeUrl,
      PROVIDERS: 'apify',
      APIFY_DAILY_RUN_LIMIT: '0',
      UPSTREAM_RETRIES: '0',
      WARM_PAGES: '',
      RATE_LIMIT_PER_MIN: '0',
      MAX_POSTS: '10',
      FRESH_TTL_SECONDS: '3600',
    });
    children.push(api2);
    const base2 = `http://127.0.0.1:${port2}`;
    await waitHealth(base2);
    assert.match(api2.__log(), /cache warmer: disabled/);

    const callsBeforeCache = (await fakeStats(fakeUrl)).calls;
    const cached = await fetchPosts(base2, key2, 'https://www.facebook.com/cern', 10);
    assert.equal(cached.status, 200);
    assertResponseShape(cached.body);
    assert.equal(cached.body.meta.source, 'cache');
    assert.deepEqual(
      cached.body.data.posts.map((p) => p.id),
      ids,
    );
    assert.equal(cached.body.meta.fetched_at, fetchedAt);
    assert.equal((await fakeStats(fakeUrl)).calls, callsBeforeCache, 'cache-only must not contact upstream');

    const quota2 = JSON.parse(await readFile(join(cacheDir, 'apify-quota.json'), 'utf8'));
    assert.equal(quota2.consumed, 1, 'quota must not reset');

    // Uncached page under cache-only → clean error, no extra quota burn
    const cold = await fetchPosts(base2, key2, 'https://www.facebook.com/nasa', 5);
    assert.equal(cold.status, 502);
    assertErrorShape(cold.body);
    assert.equal(cold.body.error.code, 'UPSTREAM_UNAVAILABLE');
    const quota3 = JSON.parse(await readFile(join(cacheDir, 'apify-quota.json'), 'utf8'));
    assert.equal(quota3.consumed, 1);

    // Secrets must not appear in logs
    assert.equal(api2.__log().includes(key2), false);

    await stopChild(api2);
    children.pop();
  });

  it('daily-limit=3 respects prior consumption: 3rd ok, 4th blocked; pageUrl change needs no rebuild', async () => {
    // Prior consumption already 1 from previous test in same cacheDir
    const key = `k${randomBytes(8).toString('hex')}`;
    const port = await freePort();
    const api = spawnApi({
      HOST: '127.0.0.1',
      PORT: String(port),
      CACHE_DIR: cacheDir,
      API_KEYS: `gui:${key}`,
      APIFY_TOKEN: 'dummy',
      APIFY_BASE_URL: fakeUrl,
      PROVIDERS: 'apify',
      APIFY_DAILY_RUN_LIMIT: '3',
      UPSTREAM_RETRIES: '0',
      WARM_PAGES: '',
      RATE_LIMIT_PER_MIN: '0',
      MAX_POSTS: '10',
      FRESH_TTL_SECONDS: '3600',
    });
    children.push(api);
    const base = `http://127.0.0.1:${port}`;
    await waitHealth(base);

    const q0 = JSON.parse(await readFile(join(cacheDir, 'apify-quota.json'), 'utf8'));
    assert.equal(q0.consumed, 1);

    const calls0 = (await fakeStats(fakeUrl)).calls;

    // 2nd total (nasa)
    const r2 = await fetchPosts(base, key, 'https://www.facebook.com/nasa', 10);
    assert.equal(r2.status, 200);
    assert.equal(r2.body.meta.source, 'live');
    assert.equal(JSON.parse(await readFile(join(cacheDir, 'apify-quota.json'), 'utf8')).consumed, 2);

    // 3rd total (another slug) — still within TOTAL daily-limit=3
    const r3 = await fetchPosts(base, key, 'https://www.facebook.com/SomeNeverCachedPage99', 5);
    assert.equal(r3.status, 200);
    assert.equal(r3.body.meta.source, 'live');
    assert.equal(JSON.parse(await readFile(join(cacheDir, 'apify-quota.json'), 'utf8')).consumed, 3);
    assert.equal((await fakeStats(fakeUrl)).calls, calls0 + 2);

    // 4th total blocked — same API process, new pageUrl (no collection rebuild)
    const r4 = await fetchPosts(base, key, 'https://www.facebook.com/AnotherColdPage88', 5);
    assert.equal(r4.status, 502);
    assertErrorShape(r4.body);
    assert.equal((await fakeStats(fakeUrl)).calls, calls0 + 2, 'blocked request must not hit upstream');
    assert.equal(JSON.parse(await readFile(join(cacheDir, 'apify-quota.json'), 'utf8')).consumed, 3);

    // Cached CERN still available without burning quota
    const cern = await fetchPosts(base, key, 'https://www.facebook.com/cern', 10);
    assert.equal(cern.status, 200);
    assert.equal(cern.body.meta.source, 'cache');
    assert.equal(JSON.parse(await readFile(join(cacheDir, 'apify-quota.json'), 'utf8')).consumed, 3);

    assert.equal(api.__log().includes(key), false);
    await stopChild(api);
    children.pop();
  });

  it('corrupt quota fails closed without wiping page cache', async () => {
    await writeFile(join(cacheDir, 'apify-quota.json'), '{not-json', 'utf8');
    const key = `k${randomBytes(8).toString('hex')}`;
    const port = await freePort();
    const api = spawnApi({
      HOST: '127.0.0.1',
      PORT: String(port),
      CACHE_DIR: cacheDir,
      API_KEYS: `gui:${key}`,
      APIFY_TOKEN: 'dummy',
      APIFY_BASE_URL: fakeUrl,
      PROVIDERS: 'apify',
      APIFY_DAILY_RUN_LIMIT: '5',
      UPSTREAM_RETRIES: '0',
      WARM_PAGES: '',
      RATE_LIMIT_PER_MIN: '0',
      MAX_POSTS: '10',
      FRESH_TTL_SECONDS: '3600',
    });
    children.push(api);
    const base = `http://127.0.0.1:${port}`;
    await waitHealth(base);

    const calls0 = (await fakeStats(fakeUrl)).calls;
    const cached = await fetchPosts(base, key, 'https://www.facebook.com/cern', 10);
    assert.equal(cached.status, 200);
    assert.ok(['cache', 'stale-cache'].includes(cached.body.meta.source));

    const cold = await fetchPosts(base, key, 'https://www.facebook.com/BrandNewCold77', 3);
    assert.equal(cold.status, 502);
    assert.equal((await fakeStats(fakeUrl)).calls, calls0);

    await stopChild(api);
    children.pop();
  });
});

describe('real .postman-local/live-cache visibility (if present)', () => {
  it('cache-only process can serve previously captured CERN without Apify', async () => {
    const shared = resolveSharedCacheDir(root);
    let hasCache = false;
    try {
      await access(shared);
      hasCache = true;
    } catch {
      hasCache = false;
    }
    if (!hasCache) {
      console.log('SKIP: no .postman-local/live-cache on disk');
      return;
    }

    const quotaBefore = await readFile(join(shared, 'apify-quota.json'), 'utf8').catch(() => null);
    const key = `gui${randomBytes(8).toString('hex')}`;
    const port = await freePort();
    // Point APIFY_BASE_URL at an unused local port — any contact would fail; cache must not need it.
    const api = spawnApi({
      HOST: '127.0.0.1',
      PORT: String(port),
      CACHE_DIR: shared,
      API_KEYS: `gui:${key}`,
      APIFY_TOKEN: 'dummy',
      APIFY_BASE_URL: 'http://127.0.0.1:9',
      PROVIDERS: 'apify',
      APIFY_DAILY_RUN_LIMIT: '0',
      UPSTREAM_RETRIES: '0',
      WARM_PAGES: '',
      RATE_LIMIT_PER_MIN: '0',
      MAX_POSTS: '10',
      FRESH_TTL_SECONDS: '86400',
    });
    try {
      const base = `http://127.0.0.1:${port}`;
      await waitHealth(base);
      assert.match(api.__log(), /cache warmer: disabled/);
      const res = await fetchPosts(base, key, 'https://www.facebook.com/cern', 10);
      assert.equal(res.status, 200, 'expected CERN in shared live-cache');
      assertResponseShape(res.body);
      assert.ok(['cache', 'stale-cache'].includes(res.body.meta.source));
      assert.equal(res.body.data.posts.length, 10);
      assert.equal(res.body.data.page.name, 'CERN');
      const quotaAfter = await readFile(join(shared, 'apify-quota.json'), 'utf8');
      assert.equal(quotaAfter, quotaBefore, 'cache-only must not rewrite quota');
      assert.equal(api.__log().includes(key), false);
    } finally {
      await stopChild(api);
    }
  });
});
