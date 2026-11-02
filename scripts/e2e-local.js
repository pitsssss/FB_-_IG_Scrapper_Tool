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
  };

  let api = spawnApi(commonEnv);
  await waitHealth(baseUrl);

  const pageOne = 'https://www.facebook.com/e2eone';
  const pageTwo = 'https://www.facebook.com/e2etwo';
  const pageNone = 'https://www.facebook.com/e2enone';
  const pageSlow = 'https://www.facebook.com/e2eslow';

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
  let rateOk = true;
  let rateDetail = '';
  for (let i = 1; i <= 3; i += 1) {
    const r = await fetchJson(rateUrl, '/api/v1/facebook/posts?page=missing', { key: apiKey });
    if (r.status !== 400) { rateOk = false; rateDetail = `req${i} status=${r.status}`; break; }
  }
  const limited = await fetchJson(rateUrl, '/api/v1/facebook/posts?page=missing', { key: apiKey });
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

  // ---- 9. security ----
  console.log('\n== 9. security ==');
  check('API key never in API logs', !apiLog.includes(apiKey), `logBytes=${apiLog.length}`);
  check('dummy token never in API logs', !apiLog.includes(FAKE_TOKEN), 'checked api stdout/stderr');

  // sample a few response bodies for "dummy"
  const bodies = [
    ...[baseLive, live3, stale, back, slow, persisted].map((r) => r?.text || JSON.stringify(r?.body || '')),
    noOriginText,
  ];
  const dummyInBody = bodies.some((t) => t && t.includes(FAKE_TOKEN));
  check('dummy token never in HTTP bodies', !dummyInBody, `bodiesChecked=${bodies.length}`);

  // Also ensure key not in bodies
  const keyInBody = bodies.some((t) => t && t.includes(apiKey));
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
