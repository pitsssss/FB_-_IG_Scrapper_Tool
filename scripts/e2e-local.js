import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startFakeUpstream } from './fake-upstream.js';
import { runSmoke } from './smoke.js';
import { assertResponseShape, assertErrorShape } from '../test/schema.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
let failed = 0;
const children = [];
const servers = [];
let cacheDir = null;
const extraDirs = [];
let usedPorts = [];
let apiLog = '';
const FAKE_TOKEN = 'dummy';

function pass(name, detail = '') {
  passed += 1;
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail) {
  failed += 1;
  console.error(`FAIL  ${name} — ${detail}`);
}
function check(name, ok, detail) {
  if (ok) pass(name, detail);
  else fail(name, detail);
  return ok;
}

async function freePort() {
  const { createServer } = await import('node:net');
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
      if (res.ok) {
        const body = await res.json();
        if (body?.status === 'ok') return;
      }
    } catch { /* retry */ }
    await sleep(100);
  }
  throw new Error(`health check timeout for ${baseUrl}`);
}

function spawnApi(env) {
  const child = spawn(process.execPath, [join(root, 'src', 'index.js')], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  child.stdout.on('data', (buf) => { apiLog += buf.toString('utf8'); });
  child.stderr.on('data', (buf) => { apiLog += buf.toString('utf8'); });
  return child;
}

async function stopChild(child, signal = 'SIGTERM') {
  if (!child || child.killed || child.exitCode !== null) return;
  await new Promise((resolve) => {
    const t = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
    }, 3000);
    child.once('exit', () => { clearTimeout(t); resolve(); });
    try { child.kill(signal); } catch { clearTimeout(t); resolve(); }
  });
}

async function fetchJson(baseUrl, path, { key, timeoutMs = 30_000, headers = {}, method = 'GET' } = {}) {
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

async function setMode(upstreamBase, mode) {
  await fetch(`${upstreamBase}/__mode`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode }),
  });
}

async function getStats(upstreamBase) {
  const res = await fetch(`${upstreamBase}/__stats`);
  return res.json();
}

async function cleanup() {
  for (const child of [...children].reverse()) {
    await stopChild(child);
  }
  children.length = 0;
  for (const s of [...servers].reverse()) {
    try { await s.close(); } catch { /* ignore */ }
  }
  servers.length = 0;
  const dirs = [...extraDirs];
  if (cacheDir) dirs.push(cacheDir);
  for (const dir of dirs) {
    try { await rm(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
  extraDirs.length = 0;
  cacheDir = null;
}

async function main() {
  const apiKey = randomBytes(24).toString('hex');
  const apiKeysEnv = `e2e:${apiKey}`;
  cacheDir = await mkdtemp(join(tmpdir(), 'fb-e2e-'));

  const fake = startFakeUpstream({ port: 0 });
  servers.push(fake);
  await fake.ready;
  const upstreamPort = fake.port;
  const upstreamBase = `http://127.0.0.1:${upstreamPort}`;
  usedPorts.push(upstreamPort);

  const apiPort = await freePort();
  usedPorts.push(apiPort);
  const baseUrl = `http://127.0.0.1:${apiPort}`;

  const commonEnv = {
    PORT: String(apiPort),
    HOST: '127.0.0.1',
    API_KEYS: apiKeysEnv,
    APIFY_TOKEN: FAKE_TOKEN,
    APIFY_BASE_URL: upstreamBase,
    PROVIDERS: 'apify',
    CACHE_DIR: cacheDir,
    FRESH_TTL_SECONDS: '3',
    RETRY_COOLDOWN_SECONDS: '1',
    UPSTREAM_RETRIES: '1',
    RETRY_BACKOFF_MS: '100',
    ALLOWED_PAGES: '',
    RATE_LIMIT_PER_MIN: '1000',
    GRAPH_PAGE_TOKENS: '',
    // High limit so original scenarios are unaffected; dedicated quota scenarios use isolated dirs.
    APIFY_DAILY_RUN_LIMIT: '1000',
    WARM_PAGES: '',
  };

  let api = spawnApi(commonEnv);
  await waitHealth(baseUrl);

  const pageOne = 'e2eone';
  const pageTwo = 'e2etwo';
  const pageNone = 'e2enone';
  const pageSlow = 'e2eslow';

  // ---- 1. smoke ----
  console.log('\n== 1. smoke ==');
  const smokeOk = await runSmoke(baseUrl, apiKey, pageOne);
  check('smoke suite', smokeOk, smokeOk ? 'all checks passed' : 'see FAIL lines above');

  // Capture baseline ids for e2eone
  const baseLive = await fetchJson(baseUrl, `/api/v1/facebook/posts?page=${encodeURIComponent(pageOne)}`, { key: apiKey });
  let baseShape = false;
  try { assertResponseShape(baseLive.body); baseShape = true; } catch (e) { fail('baseline shape', e.message); }
  check('baseline response shape', baseShape && baseLive.status === 200, `status=${baseLive.status}`);

  // ---- 2. concurrency ----
  console.log('\n== 2. concurrency ==');
  await setMode(upstreamBase, 'ok');
  const before = await getStats(upstreamBase);
  const parallel = await Promise.all(
    Array.from({ length: 5 }, () => fetchJson(baseUrl, `/api/v1/facebook/posts?page=${encodeURIComponent(pageTwo)}`, { key: apiKey, timeoutMs: 60_000 })),
  );
  const after = await getStats(upstreamBase);
  const all200 = parallel.every((r) => r.status === 200);
  const idSets = parallel.map((r) => (r.body?.data?.posts || []).map((p) => p.id).join(','));
  const idsSame = idSets.every((s) => s === idSets[0] && s.length > 0);
  const callsDelta = after.calls - before.calls;
  check(
    'concurrency 5 parallel',
    all200 && idsSame && callsDelta === 1,
    `status200=${all200} idsSame=${idsSame} upstreamDelta=${callsDelta} count=${parallel[0]?.body?.meta?.count} source=${parallel[0]?.body?.meta?.source}`,
  );

  // ---- 3. stale fallback ----
  console.log('\n== 3. stale fallback ==');
  await setMode(upstreamBase, 'ok');
  // ensure fresh cache for e2eone
  const live3 = await fetchJson(baseUrl, `/api/v1/facebook/posts?page=${encodeURIComponent(pageOne)}`, { key: apiKey });
  check('stale: initial live/cache', live3.status === 200, `source=${live3.body?.meta?.source}`);
  const ids3 = (live3.body?.data?.posts || []).map((p) => p.id).join(',');
  const fetched3 = live3.body?.meta?.fetched_at;

  const repeat3 = await fetchJson(baseUrl, `/api/v1/facebook/posts?page=${encodeURIComponent(pageOne)}`, { key: apiKey });
  check('stale: immediate repeat is cache', repeat3.body?.meta?.source === 'cache', `source=${repeat3.body?.meta?.source}`);

  await sleep(4000);
  await setMode(upstreamBase, 'fail');
  const stale = await fetchJson(baseUrl, `/api/v1/facebook/posts?page=${encodeURIComponent(pageOne)}`, { key: apiKey });
  const staleIds = (stale.body?.data?.posts || []).map((p) => p.id).join(',');
  check(
    'stale: fail upstream -> stale-cache same ids',
    stale.status === 200 && stale.body?.meta?.source === 'stale-cache' && staleIds === ids3,
    `source=${stale.body?.meta?.source} idsMatch=${staleIds === ids3}`,
  );

  await sleep(1000);
  await setMode(upstreamBase, 'empty');
  const empty = await fetchJson(baseUrl, `/api/v1/facebook/posts?page=${encodeURIComponent(pageOne)}`, { key: apiKey });
  const emptyIds = (empty.body?.data?.posts || []).map((p) => p.id).join(',');
  check(
    'stale: empty upstream still same ids',
    empty.status === 200 && emptyIds === ids3,
    `status=${empty.status} source=${empty.body?.meta?.source} idsMatch=${emptyIds === ids3}`,
  );

  await setMode(upstreamBase, 'ok');
  let recovered = false;
  let recoveredDetail = '';
  const recoverStart = Date.now();
  while (Date.now() - recoverStart < 5000) {
    const r = await fetchJson(baseUrl, `/api/v1/facebook/posts?page=${encodeURIComponent(pageOne)}`, { key: apiKey });
    if (
      r.status === 200
      && r.body?.meta?.source === 'cache'
      && r.body?.meta?.warning === null
      && r.body?.meta?.fetched_at
      && r.body.meta.fetched_at !== fetched3
    ) {
      recovered = true;
      recoveredDetail = `source=${r.body.meta.source} fetched_at=${r.body.meta.fetched_at}`;
      break;
    }
    recoveredDetail = `source=${r.body?.meta?.source} warning=${r.body?.meta?.warning} fetched_at=${r.body?.meta?.fetched_at}`;
    await sleep(200);
  }
  check('stale: recover to cache with newer fetched_at', recovered, recoveredDetail);

  // ---- 4. persistence ----
  console.log('\n== 4. persistence ==');
  await stopChild(api);
  await setMode(upstreamBase, 'fail');
  api = spawnApi(commonEnv);
  await waitHealth(baseUrl);
  const persisted = await fetchJson(baseUrl, `/api/v1/facebook/posts?page=${encodeURIComponent(pageOne)}`, { key: apiKey });
  const persIds = (persisted.body?.data?.posts || []).map((p) => p.id).join(',');
  check(
    'persistence after restart',
    persisted.status === 200
      && ['cache', 'stale-cache'].includes(persisted.body?.meta?.source)
      && persIds === ids3,
    `source=${persisted.body?.meta?.source} idsMatch=${persIds === ids3}`,
  );

  // ---- 5. no cache + upstream down ----
  console.log('\n== 5. no cache + upstream down ==');
  await setMode(upstreamBase, 'fail');
  const down1 = await fetchJson(baseUrl, `/api/v1/facebook/posts?page=${encodeURIComponent(pageNone)}`, { key: apiKey, timeoutMs: 30_000 });
  let downShape = false;
  try { assertErrorShape(down1.body); downShape = true; } catch (e) { fail('down shape', e.message); }
  check(
    'no-cache upstream fail -> 502 UPSTREAM_UNAVAILABLE',
    down1.status === 502 && down1.body?.error?.code === 'UPSTREAM_UNAVAILABLE' && downShape,
    `status=${down1.status} code=${down1.body?.error?.code}`,
  );
  const down2 = await fetchJson(baseUrl, `/api/v1/facebook/posts?page=${encodeURIComponent(pageNone)}`, { key: apiKey });
  check(
    'immediate retry still 502 (cooldown)',
    down2.status === 502 && down2.body?.error?.code === 'UPSTREAM_UNAVAILABLE',
    `status=${down2.status}`,
  );
  await setMode(upstreamBase, 'ok');
  await sleep(1500);
  const back = await fetchJson(baseUrl, `/api/v1/facebook/posts?page=${encodeURIComponent(pageNone)}`, { key: apiKey, timeoutMs: 30_000 });
  check(
    'after cooldown ok -> 200 live',
    back.status === 200 && back.body?.meta?.source === 'live',
    `status=${back.status} source=${back.body?.meta?.source} count=${back.body?.meta?.count}`,
  );

  // ---- 6. slow upstream ----
  console.log('\n== 6. slow upstream ==');
  await setMode(upstreamBase, 'ok');
  await setMode(upstreamBase, 'slow');
  const tSlow = Date.now();
  const slow = await fetchJson(baseUrl, `/api/v1/facebook/posts?page=${encodeURIComponent(pageSlow)}`, { key: apiKey, timeoutMs: 60_000 });
  const slowMs = Date.now() - tSlow;
  check(
    'slow upstream -> 200 live (~8s)',
    slow.status === 200 && slow.body?.meta?.source === 'live' && slowMs >= 7000,
    `status=${slow.status} source=${slow.body?.meta?.source} ${slowMs}ms`,
  );
  await setMode(upstreamBase, 'ok');

  // ---- 7. rate limit ----
  console.log('\n== 7. rate limit ==');
  const ratePort = await freePort();
  usedPorts.push(ratePort);
  const rateUrl = `http://127.0.0.1:${ratePort}`;
  const rateDir = await mkdtemp(join(tmpdir(), 'fb-e2e-rate-'));
  extraDirs.push(rateDir);
  const rateChild = spawnApi({
    ...commonEnv,
    PORT: String(ratePort),
    RATE_LIMIT_PER_MIN: '3',
    CACHE_DIR: rateDir,
  });
  await waitHealth(rateUrl);
  // Use an invalid username so requests return 400 (no upstream) while still counting toward the limit.
  const ratePath = '/api/v1/facebook/posts?page=%40bad';
  let rateOk = true;
  let rateDetail = '';
  for (let i = 1; i <= 3; i += 1) {
    const r = await fetchJson(rateUrl, ratePath, { key: apiKey });
    if (r.status !== 400) { rateOk = false; rateDetail = `req${i} status=${r.status}`; break; }
  }
  const limited = await fetchJson(rateUrl, ratePath, { key: apiKey });
  let limitedShape = false;
  try { assertErrorShape(limited.body); limitedShape = true; } catch (e) { fail('429 shape', e.message); }
  const retryAfter = limited.headers.get('retry-after');
  const retryNum = Number.parseInt(retryAfter || '', 10);
  check(
    'rate limit 4th -> 429 Retry-After',
    rateOk && limited.status === 429 && limitedShape && Number.isFinite(retryNum),
    `status=${limited.status} retry-after=${retryAfter} ${rateDetail}`,
  );
  await stopChild(rateChild);

  // ---- 8. CORS ----
  console.log('\n== 8. CORS ==');
  const corsPort = await freePort();
  usedPorts.push(corsPort);
  const corsUrl = `http://127.0.0.1:${corsPort}`;
  const corsDir = await mkdtemp(join(tmpdir(), 'fb-e2e-cors-'));
  extraDirs.push(corsDir);
  const corsChild = spawnApi({
    ...commonEnv,
    PORT: String(corsPort),
    ALLOWED_ORIGINS: 'https://site.example',
    CACHE_DIR: corsDir,
  });
  await waitHealth(corsUrl);

  const preflightOk = await fetch(`${corsUrl}/api/v1/facebook/posts?page=${encodeURIComponent(pageOne)}`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://site.example',
      'Access-Control-Request-Method': 'GET',
    },
  });
  check(
    'CORS preflight allowed origin',
    preflightOk.status === 204 && preflightOk.headers.get('access-control-allow-origin') === 'https://site.example',
    `status=${preflightOk.status} acao=${preflightOk.headers.get('access-control-allow-origin')}`,
  );

  const preflightBad = await fetch(`${corsUrl}/api/v1/facebook/posts?page=${encodeURIComponent(pageOne)}`, {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://evil.example',
      'Access-Control-Request-Method': 'GET',
    },
  });
  check(
    'CORS preflight evil origin has no ACAO',
    preflightBad.status === 204 && !preflightBad.headers.get('access-control-allow-origin'),
    `status=${preflightBad.status} acao=${preflightBad.headers.get('access-control-allow-origin')}`,
  );

  const noOriginRaw = await fetch(`${corsUrl}/api/v1/facebook/posts?page=${encodeURIComponent(pageOne)}`, {
    headers: { 'x-api-key': apiKey },
  });
  const noOriginText = await noOriginRaw.text();
  check(
    'GET without Origin works, no CORS header',
    noOriginRaw.status === 200 && !noOriginRaw.headers.get('access-control-allow-origin'),
    `status=${noOriginRaw.status} acao=${noOriginRaw.headers.get('access-control-allow-origin')}`,
  );
  await stopChild(corsChild);

  // ---- 10. quota persistence / exhaustion ----
  console.log('\n== 10. apify quota ==');
  await setMode(upstreamBase, 'ok');
  await fetch(`${upstreamBase}/__reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const quotaDir = await mkdtemp(join(tmpdir(), 'fb-e2e-quota-'));
  extraDirs.push(quotaDir);
  const quotaPort = await freePort();
  usedPorts.push(quotaPort);
  const quotaUrl = `http://127.0.0.1:${quotaPort}`;
  let quotaChild = spawnApi({
    ...commonEnv,
    PORT: String(quotaPort),
    CACHE_DIR: quotaDir,
    APIFY_DAILY_RUN_LIMIT: '2',
    UPSTREAM_RETRIES: '0',
    RETRY_COOLDOWN_SECONDS: '0',
    FRESH_TTL_SECONDS: '3600',
    APIFY_MAX_CHARGE_USD_PER_RUN: '0.15',
  });
  await waitHealth(quotaUrl);

  const q1 = await fetchJson(quotaUrl, `/api/v1/facebook/posts?page=${encodeURIComponent('qpage1')}`, { key: apiKey });
  const q2 = await fetchJson(quotaUrl, `/api/v1/facebook/posts?page=${encodeURIComponent('qpage2')}`, { key: apiKey });
  check('quota: first two invocations succeed', q1.status === 200 && q2.status === 200, `s1=${q1.status} s2=${q2.status}`);
  const qIds = (q1.body?.data?.posts || []).map((p) => p.id).join(',');

  const lastRes = await fetch(`${upstreamBase}/__last`);
  const lastBody = await lastRes.json();
  check(
    'quota: maxTotalChargeUsd present on outbound URL',
    typeof lastBody.url === 'string' && lastBody.url.includes('maxTotalChargeUsd=0.15'),
    `url=${lastBody.url}`,
  );

  const statsBeforeThird = await getStats(upstreamBase);
  const q3 = await fetchJson(quotaUrl, `/api/v1/facebook/posts?page=${encodeURIComponent('qpage3')}`, { key: apiKey });
  const statsAfterThird = await getStats(upstreamBase);
  let q3Err = false;
  try { assertErrorShape(q3.body); q3Err = true; } catch (e) { fail('quota third shape', e.message); }
  check(
    'quota: third no-cache denied without upstream call',
    q3.status === 502 && q3Err && statsAfterThird.calls === statsBeforeThird.calls,
    `status=${q3.status} callsDelta=${statsAfterThird.calls - statsBeforeThird.calls}`,
  );

  // Cached page still served after exhaustion
  const qCached = await fetchJson(quotaUrl, `/api/v1/facebook/posts?page=${encodeURIComponent('qpage1')}`, { key: apiKey });
  check(
    'quota: cached page still 200 after exhaustion',
    qCached.status === 200 && (qCached.body?.data?.posts || []).map((p) => p.id).join(',') === qIds,
    `status=${qCached.status} source=${qCached.body?.meta?.source}`,
  );

  // Restart preserves consumed count
  await stopChild(quotaChild);
  const statsBeforeRestart = await getStats(upstreamBase);
  quotaChild = spawnApi({
    ...commonEnv,
    PORT: String(quotaPort),
    CACHE_DIR: quotaDir,
    APIFY_DAILY_RUN_LIMIT: '2',
    UPSTREAM_RETRIES: '0',
    RETRY_COOLDOWN_SECONDS: '0',
    FRESH_TTL_SECONDS: '3600',
  });
  await waitHealth(quotaUrl);
  const qAfterRestart = await fetchJson(quotaUrl, `/api/v1/facebook/posts?page=${encodeURIComponent('qpage4')}`, { key: apiKey });
  const statsAfterRestart = await getStats(upstreamBase);
  check(
    'quota: restart preserves consumption (no new upstream)',
    qAfterRestart.status === 502 && statsAfterRestart.calls === statsBeforeRestart.calls,
    `status=${qAfterRestart.status} callsDelta=${statsAfterRestart.calls - statsBeforeRestart.calls}`,
  );

  // Retries respect quota: limit 1, retries=1 -> only 1 outbound (second attempt blocked by quota)
  await stopChild(quotaChild);
  await fetch(`${upstreamBase}/__reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  await setMode(upstreamBase, 'fail');
  const retryDir = await mkdtemp(join(tmpdir(), 'fb-e2e-qretry-'));
  extraDirs.push(retryDir);
  const retryPort = await freePort();
  usedPorts.push(retryPort);
  const retryUrl = `http://127.0.0.1:${retryPort}`;
  const retryChild = spawnApi({
    ...commonEnv,
    PORT: String(retryPort),
    CACHE_DIR: retryDir,
    APIFY_DAILY_RUN_LIMIT: '1',
    UPSTREAM_RETRIES: '1',
    RETRY_BACKOFF_MS: '50',
    RETRY_COOLDOWN_SECONDS: '0',
  });
  await waitHealth(retryUrl);
  const beforeRetry = await getStats(upstreamBase);
  const retryRes = await fetchJson(retryUrl, `/api/v1/facebook/posts?page=${encodeURIComponent('qretry')}`, { key: apiKey, timeoutMs: 30_000 });
  const afterRetry = await getStats(upstreamBase);
  check(
    'quota: retries do not exceed daily limit',
    retryRes.status === 502 && afterRetry.calls - beforeRetry.calls === 1,
    `status=${retryRes.status} upstreamDelta=${afterRetry.calls - beforeRetry.calls}`,
  );
  await stopChild(retryChild);
  await setMode(upstreamBase, 'ok');

  // ---- 11. cache warmer ----
  console.log('\n== 11. cache warmer ==');
  await fetch(`${upstreamBase}/__reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const warmDir = await mkdtemp(join(tmpdir(), 'fb-e2e-warm-'));
  extraDirs.push(warmDir);
  const warmPort = await freePort();
  usedPorts.push(warmPort);
  const warmUrl = `http://127.0.0.1:${warmPort}`;
  const warmPage = 'e2ewarm';
  const warmChild = spawnApi({
    ...commonEnv,
    PORT: String(warmPort),
    CACHE_DIR: warmDir,
    APIFY_DAILY_RUN_LIMIT: '50',
    FRESH_TTL_SECONDS: '3600',
    RETRY_COOLDOWN_SECONDS: '0',
    UPSTREAM_RETRIES: '0',
    WARM_PAGES: warmPage,
    WARM_STARTUP_DELAY_SECONDS: '1',
    WARM_INTERVAL_SECONDS: '0',
    WARM_CONCURRENCY: '1',
  });
  await waitHealth(warmUrl);

  // Wait until warmer has populated cache (poll GET until 200 cache/live)
  let warmed = null;
  const warmDeadline = Date.now() + 10_000;
  while (Date.now() < warmDeadline) {
    const r = await fetchJson(warmUrl, `/api/v1/facebook/posts?page=${encodeURIComponent(warmPage)}`, { key: apiKey });
    if (r.status === 200 && (r.body?.data?.posts || []).length) {
      warmed = r;
      break;
    }
    await sleep(200);
  }
  check(
    'warmer: startup warms page for public GET',
    warmed?.status === 200 && ['live', 'cache'].includes(warmed?.body?.meta?.source),
    `status=${warmed?.status} source=${warmed?.body?.meta?.source} count=${warmed?.body?.meta?.count}`,
  );
  const warmIds = (warmed?.body?.data?.posts || []).map((p) => p.id).join(',');
  const statsAfterWarm = await getStats(upstreamBase);

  // Fresh: public GET + no extra upstream from a second GET
  const warmHit = await fetchJson(warmUrl, `/api/v1/facebook/posts?page=${encodeURIComponent(warmPage)}`, { key: apiKey });
  const statsAfterHit = await getStats(upstreamBase);
  check(
    'warmer: fresh cache GET does not call upstream again',
    warmHit.status === 200 && warmHit.body?.meta?.source === 'cache' && statsAfterHit.calls === statsAfterWarm.calls,
    `source=${warmHit.body?.meta?.source} callsDelta=${statsAfterHit.calls - statsAfterWarm.calls}`,
  );

  // Single-flight: parallel GETs for a NEW page while warmer is stopped — use main API path
  // Failure preservation: set upstream fail, force stale warm via short TTL instance
  await stopChild(warmChild);
  await setMode(upstreamBase, 'fail');
  const warmFailPort = await freePort();
  usedPorts.push(warmFailPort);
  const warmFailUrl = `http://127.0.0.1:${warmFailPort}`;
  const warmFailChild = spawnApi({
    ...commonEnv,
    PORT: String(warmFailPort),
    CACHE_DIR: warmDir, // same cache with warmIds
    APIFY_DAILY_RUN_LIMIT: '50',
    FRESH_TTL_SECONDS: '0',
    RETRY_COOLDOWN_SECONDS: '0',
    UPSTREAM_RETRIES: '0',
    WARM_PAGES: warmPage,
    WARM_STARTUP_DELAY_SECONDS: '1',
    WARM_INTERVAL_SECONDS: '0',
  });
  await waitHealth(warmFailUrl);
  await sleep(1500); // allow failed warm attempt
  const preserved = await fetchJson(warmFailUrl, `/api/v1/facebook/posts?page=${encodeURIComponent(warmPage)}`, { key: apiKey });
  check(
    'warmer: cache preserved after upstream failure',
    preserved.status === 200
      && (preserved.body?.data?.posts || []).map((p) => p.id).join(',') === warmIds,
    `status=${preserved.status} source=${preserved.body?.meta?.source}`,
  );
  await stopChild(warmFailChild);
  await setMode(upstreamBase, 'ok');

  // Scheduler cleanup already covered by stopChild; health of main API still ok
  const mainHealth = await fetchJson(baseUrl, '/health');
  check('warmer: main API still healthy after warmer instances stopped', mainHealth.status === 200, `status=${mainHealth.status}`);

  // ---- 12. per-client page scopes ----
  console.log('\n== 12. page scopes ==');
  await fetch(`${upstreamBase}/__reset`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  await setMode(upstreamBase, 'ok');
  const scopeDir = await mkdtemp(join(tmpdir(), 'fb-e2e-scope-'));
  extraDirs.push(scopeDir);
  const scopePort = await freePort();
  usedPorts.push(scopePort);
  const scopeUrl = `http://127.0.0.1:${scopePort}`;
  const scopeKeyA = randomBytes(16).toString('hex');
  const scopeKeyB = randomBytes(16).toString('hex');
  const scopeChild = spawnApi({
    ...commonEnv,
    PORT: String(scopePort),
    CACHE_DIR: scopeDir,
    API_KEYS: `website1:${scopeKeyA},website2:${scopeKeyB}`,
    API_KEY_PAGE_SCOPES: JSON.stringify({
      website1: ['pagea'],
      website2: ['pageb'],
    }),
    APIFY_DAILY_RUN_LIMIT: '50',
    UPSTREAM_RETRIES: '0',
    FRESH_TTL_SECONDS: '3600',
  });
  await waitHealth(scopeUrl);
  const scopeBefore = await getStats(upstreamBase);
  const sa = await fetchJson(scopeUrl, `/api/v1/facebook/posts?page=${encodeURIComponent('pagea')}`, { key: scopeKeyA });
  const sab = await fetchJson(scopeUrl, `/api/v1/facebook/posts?page=${encodeURIComponent('pageb')}`, { key: scopeKeyA });
  const sb = await fetchJson(scopeUrl, `/api/v1/facebook/posts?page=${encodeURIComponent('pageb')}`, { key: scopeKeyB });
  const sba = await fetchJson(scopeUrl, `/api/v1/facebook/posts?page=${encodeURIComponent('pagea')}`, { key: scopeKeyB });
  const scopeAfterDeny = await getStats(upstreamBase);
  check('scopes: A/pageA 200', sa.status === 200, `status=${sa.status}`);
  check('scopes: A/pageB 403', sab.status === 403 && sab.body?.error?.code === 'PAGE_NOT_ALLOWED', `status=${sab.status}`);
  check('scopes: B/pageB 200', sb.status === 200, `status=${sb.status}`);
  check('scopes: B/pageA 403', sba.status === 403, `status=${sba.status}`);
  check(
    'scopes: unauthorized requests add no upstream calls beyond authorized',
    scopeAfterDeny.calls - scopeBefore.calls === 2,
    `upstreamDelta=${scopeAfterDeny.calls - scopeBefore.calls}`,
  );
  const saCache = await fetchJson(scopeUrl, `/api/v1/facebook/posts?page=${encodeURIComponent('pagea')}`, { key: scopeKeyA });
  check('scopes: authorized repeat is cache', saCache.status === 200 && saCache.body?.meta?.source === 'cache', `source=${saCache.body?.meta?.source}`);
  await stopChild(scopeChild);

  // ---- 9. Instagram (synthetic) ----
  console.log('\n== 9. Instagram (synthetic) ==');
  await setMode(upstreamBase, 'ok');
  const igUser = 'nasa';
  const igPath = `/api/v1/instagram/posts?page=${encodeURIComponent(igUser)}&limit=10`;
  const igBefore = await getStats(upstreamBase);
  const igLive = await fetchJson(baseUrl, igPath, { key: apiKey });
  let igShape = false;
  try { assertResponseShape(igLive.body); igShape = true; } catch (e) { fail('instagram shape', e.message); }
  check('instagram: live 200 + schema', igLive.status === 200 && igShape, `status=${igLive.status} source=${igLive.body?.meta?.source}`);
  check('instagram: page url is instagram', /instagram\.com\/nasa/i.test(igLive.body?.data?.page?.url || ''), `url=${igLive.body?.data?.page?.url}`);
  const igIds = (igLive.body?.data?.posts || []).map((p) => p.id).join(',');
  const igCache = await fetchJson(baseUrl, igPath, { key: apiKey });
  check('instagram: repeat is cache', igCache.status === 200 && igCache.body?.meta?.source === 'cache', `source=${igCache.body?.meta?.source}`);
  check('instagram: cache IDs stable', (igCache.body?.data?.posts || []).map((p) => p.id).join(',') === igIds, 'ids match');
  const igParallel = await Promise.all(
    Array.from({ length: 5 }, () => fetchJson(baseUrl, `/api/v1/instagram/posts?page=${encodeURIComponent('natgeo')}&limit=5`, { key: apiKey, timeoutMs: 60_000 })),
  );
  const igAfter = await getStats(upstreamBase);
  const igAll200 = igParallel.every((r) => r.status === 200);
  const igDelta = igAfter.calls - igBefore.calls;
  check(
    'instagram: 5 parallel single-flight (+1 live nasa)',
    igAll200 && igDelta === 2,
    `all200=${igAll200} upstreamDelta=${igDelta} (expect 2: nasa live + natgeo live)`,
  );
  const igBad = await fetchJson(baseUrl, `/api/v1/instagram/posts?page=${encodeURIComponent('https://www.instagram.com/p/ABC/')}`, { key: apiKey });
  check('instagram: post URL rejected 400', igBad.status === 400 && igBad.body?.error?.code === 'INVALID_PAGE_URL', `status=${igBad.status}`);
  // Cross-platform isolation: FB cache key must not satisfy IG
  const fbCern = await fetchJson(baseUrl, `/api/v1/facebook/posts?page=${encodeURIComponent(pageOne)}`, { key: apiKey });
  check('instagram: facebook still works', fbCern.status === 200, `status=${fbCern.status}`);
  check('instagram: shares non-negative', (igLive.body?.data?.posts || []).every((p) => Number.isInteger(p.stats?.shares) && p.stats.shares >= 0), 'shares ok');

  // ---- 10. security ----
  console.log('\n== 10. security ==');
  check('API key never in API logs', !apiLog.includes(apiKey) && !apiLog.includes(scopeKeyA) && !apiLog.includes(scopeKeyB), `logBytes=${apiLog.length}`);
  check('dummy token never in API logs', !apiLog.includes(FAKE_TOKEN), 'checked api stdout/stderr');

  // sample a few response bodies for "dummy"
  const bodies = [
    ...[baseLive, live3, stale, back, slow, persisted, q1, qCached, warmed, preserved, sa, sb, igLive, igCache].map((r) => r?.text || JSON.stringify(r?.body || '')),
    noOriginText,
  ];
  const dummyInBody = bodies.some((t) => t && t.includes(FAKE_TOKEN));
  check('dummy token never in HTTP bodies', !dummyInBody, `bodiesChecked=${bodies.length}`);

  // Also ensure key not in bodies
  const keyInBody = bodies.some((t) => t && (t.includes(apiKey) || t.includes(scopeKeyA) || t.includes(scopeKeyB)));
  check('API key never in HTTP bodies', !keyInBody, `bodiesChecked=${bodies.length}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  return failed === 0 ? 0 : 1;
}

let exiting = false;
async function shutdown(code) {
  if (exiting) return;
  exiting = true;
  await cleanup();
  process.exit(code);
}

process.on('SIGINT', () => { shutdown(1); });
process.on('exit', () => {
  // sync best-effort: children may already be cleaned in finally
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .then(async (code) => {
      // leftover port proof printed by caller after second run; store ports on stdout marker
      console.log(`E2E_PORTS ${usedPorts.join(',')}`);
      await cleanup();
      process.exit(code);
    })
    .catch(async (err) => {
      console.error('E2E crashed:', err?.message || err);
      console.log(`E2E_PORTS ${usedPorts.join(',')}`);
      await cleanup();
      process.exit(1);
    });
}
