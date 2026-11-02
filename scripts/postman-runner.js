/**
 * Postman/Newman local runner for fb-posts-api.
 *
 * Modes:
 *   offline — fake upstream, zero Apify calls
 *   live    — ONE controlled real Apify invocation (requires APIFY_TOKEN in .env)
 *   serve   — long-running local API + ignored Postman environment for Desktop
 *
 * Usage:
 *   node scripts/postman-runner.js offline
 *   node scripts/postman-runner.js live
 *   node scripts/postman-runner.js serve
 *   node scripts/postman-runner.js serve --live
 *   node scripts/postman-runner.js serve --live --daily-limit=3
 *
 * `postman:live` and `postman:serve` share `.postman-local/live-cache` (posts + quota).
 */
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { startFakeUpstream } from './fake-upstream.js';
import {
  parseServeFlags,
  resolveMaxChargeUsd,
  resolveSharedCacheDir,
} from './postman-shared.js';

const require = createRequire(import.meta.url);
const newman = require('newman');

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const collectionPath = join(root, 'postman', 'Facebook-Posts-API.postman_collection.json');
const localDir = join(root, '.postman-local');
const sharedCacheDir = resolveSharedCacheDir(root);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGE_CERN = 'https://www.facebook.com/cern';
const PAGE_NASA = 'https://www.facebook.com/nasa';
const PAGE_COLD = 'https://www.facebook.com/cern';

const children = [];
const servers = [];
let tempDirs = [];

function log(msg) {
  console.log(msg);
}

function fail(msg) {
  console.error(`ERROR: ${msg}`);
}

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

async function waitHealth(baseUrl, timeoutMs = 20_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) {
        const body = await res.json();
        if (body?.status === 'ok') return;
      }
    } catch {
      /* retry */
    }
    await sleep(100);
  }
  throw new Error(`health timeout for ${baseUrl}`);
}

function spawnApi(env) {
  const child = spawn(process.execPath, [join(root, 'src', 'index.js')], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
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

async function stopChild(child, signal = 'SIGTERM') {
  if (!child || child.killed || child.exitCode !== null) return;
  await new Promise((resolve) => {
    const t = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    }, 4000);
    child.once('exit', () => {
      clearTimeout(t);
      resolve();
    });
    try {
      child.kill(signal);
    } catch {
      clearTimeout(t);
      resolve();
    }
  });
}

async function cleanup() {
  for (const child of [...children].reverse()) {
    await stopChild(child);
  }
  children.length = 0;
  for (const s of [...servers]) {
    try {
      await s.close();
    } catch {
      /* ignore */
    }
  }
  servers.length = 0;
  await sleep(50);
  for (const d of tempDirs) {
    try {
      await rm(d, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  tempDirs = [];
}

function randomKey(bytes = 24) {
  return randomBytes(bytes).toString('hex');
}

/** Read .env without printing values. Returns map of KEY -> raw value. */
async function readDotEnv() {
  try {
    const text = await readFile(join(root, '.env'), 'utf8');
    const out = {};
    for (const line of text.split(/\r?\n/)) {
      if (!line || line.trim().startsWith('#')) continue;
      const i = line.indexOf('=');
      if (i <= 0) continue;
      const k = line.slice(0, i).trim();
      let v = line.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function envValues(map) {
  return Object.entries(map).map(([key, value]) => ({
    key,
    value: String(value ?? ''),
    enabled: true,
  }));
}

function runNewman({ folders, environment, reporters = ['cli'] }) {
  return new Promise((resolve) => {
    newman.run(
      {
        collection: collectionPath,
        environment: { name: 'runtime', values: envValues(environment) },
        folder: folders,
        reporters,
        abortOnFailure: false,
        delayRequest: 50,
      },
      (err, summary) => {
        resolve({ err, summary });
      },
    );
  });
}

function summarizeNewman(summary) {
  const run = summary?.run;
  const stats = run?.stats || {};
  const failures = run?.failures || [];
  return {
    assertions: stats.assertions || {},
    requests: stats.requests || {},
    failures: failures.map((f) => ({
      name: f.source?.name || f.parent?.name || 'unknown',
      error: f.error?.message || String(f.error || f),
    })),
    totalFail: (stats.assertions?.failed || 0) + (failures.length ? 0 : 0),
  };
}

async function runOffline() {
  log('== postman:offline (synthetic fake upstream, zero Apify) ==');
  const keyA = `a${randomKey(16)}`;
  const keyB = `b${randomKey(16)}`;
  const cacheDir = await mkdtemp(join(tmpdir(), 'fb-postman-off-'));
  tempDirs.push(cacheDir);

  const fake = startFakeUpstream({ port: 0, host: '127.0.0.1' });
  servers.push(fake);
  const { port: fakePort } = await fake.ready;
  const fakeUrl = `http://127.0.0.1:${fakePort}`;

  const apiPort = await freePort();
  const scopes = JSON.stringify({
    clientA: [PAGE_CERN, PAGE_COLD],
    clientB: [PAGE_NASA],
  });

  const child = spawnApi({
    HOST: '127.0.0.1',
    PORT: String(apiPort),
    CACHE_DIR: cacheDir,
    API_KEYS: `clientA:${keyA},clientB:${keyB}`,
    API_KEY_PAGE_SCOPES: scopes,
    APIFY_TOKEN: 'dummy',
    APIFY_BASE_URL: fakeUrl,
    PROVIDERS: 'apify',
    APIFY_DAILY_RUN_LIMIT: '50',
    UPSTREAM_RETRIES: '0',
    WARM_PAGES: '',
    FRESH_TTL_SECONDS: '3600',
    RATE_LIMIT_PER_MIN: '0',
    MAX_POSTS: '10',
  });

  const baseUrl = `http://127.0.0.1:${apiPort}`;
  await waitHealth(baseUrl);

  const environment = {
    baseUrl,
    apiKey: keyA,
    apiKeyB: keyB,
    pageUrl: PAGE_CERN,
    unauthorizedPageUrl: PAGE_NASA,
    limit: '10',
    invalidApiKey: 'invalid-key-not-real',
    fakeUpstreamUrl: fakeUrl,
  };

  const folders = [
    '01 — Health & Connectivity',
    '02 — Real Facebook Posts',
    '03 — Cache Validation',
    '04 — Validation & Error Handling',
    '05 — Multi-Site Authorization',
    '06 — Offline Resilience (synthetic)',
  ];

  const { err, summary } = await runNewman({ folders, environment });
  const s = summarizeNewman(summary);
  const scriptOrAssertFails =
    (s.assertions.failed || 0) + (s.failures.length || 0) + (err ? 1 : 0) + (s.requests.failed || 0);

  log(`Newman assertions: total=${s.assertions.total || 0} failed=${s.assertions.failed || 0}`);
  log(`Newman requests: total=${s.requests.total || 0} failed=${s.requests.failed || 0}`);
  log(`Newman script/runtime failures: ${s.failures.length}`);
  if (s.failures.length) {
    for (const f of s.failures.slice(0, 20)) {
      fail(`${f.name}: ${f.error}`);
    }
  }

  // Confirm zero real Apify: fake upstream received calls; APIFY_BASE_URL was local.
  const statsRes = await fetch(`${fakeUrl}/__stats`);
  const stats = await statsRes.json();
  log(`fake_upstream_calls=${stats.calls} (expected > 0; all synthetic)`);

  const apiLog = child.__log();
  if (apiLog.includes(keyA) || apiLog.includes(keyB)) {
    fail('API key leaked into server logs');
    await cleanup();
    log('POSTMAN_OFFLINE: FAIL');
    return 1;
  }

  await cleanup();
  if (scriptOrAssertFails > 0) {
    log('POSTMAN_OFFLINE: FAIL');
    return 1;
  }
  log('POSTMAN_OFFLINE: PASS');
  return 0;
}

async function runLive() {
  log('== postman:live (ONE controlled Apify invocation) ==');
  const dotenv = await readDotEnv();
  const token = (dotenv.APIFY_TOKEN || '').trim();
  if (!token) {
    fail('APIFY_TOKEN missing/empty in .env — cannot run live test.');
    fail('Add APIFY_TOKEN to .env (never commit it), then re-run: npm run postman:live');
    return 2;
  }

  await mkdir(localDir, { recursive: true });
  const liveCache = sharedCacheDir;
  await mkdir(liveCache, { recursive: true });

  // Fail closed if this shared live cache already consumed today's quota.
  const quotaPath = join(liveCache, 'apify-quota.json');
  try {
    const raw = await readFile(quotaPath, 'utf8');
    const q = JSON.parse(raw);
    const today = new Date().toISOString().slice(0, 10);
    if (q && q.utcDate === today && Number(q.consumed) >= 1) {
      fail(
        `Live quota already consumed today in ${quotaPath} (consumed=${q.consumed}). ` +
          'Refusing to reset quota or make another paid call. ' +
          'Cached pages remain available via: npm run postman:serve ' +
          '(or raise the TOTAL daily budget with: npm run postman:serve -- --live --daily-limit=N).',
      );
      return 3;
    }
  } catch (e) {
    if (e && e.code !== 'ENOENT') {
      fail(`Cannot read live quota state: ${e.message}`);
      return 3;
    }
  }

  const key = `live${randomKey(16)}`;
  const apiPort = await freePort();
  const maxCharge = resolveMaxChargeUsd(dotenv);

  const child = spawnApi({
    HOST: '127.0.0.1',
    PORT: String(apiPort),
    CACHE_DIR: liveCache,
    API_KEYS: `live:${key}`,
    API_KEY_PAGE_SCOPES: '',
    APIFY_TOKEN: token,
    APIFY_BASE_URL: dotenv.APIFY_BASE_URL || 'https://api.apify.com',
    APIFY_ACTOR: dotenv.APIFY_ACTOR || 'apify~facebook-posts-scraper',
    PROVIDERS: 'apify',
    APIFY_DAILY_RUN_LIMIT: '1',
    APIFY_MAX_CHARGE_USD_PER_RUN: maxCharge,
    UPSTREAM_RETRIES: '0',
    WARM_PAGES: '',
    FRESH_TTL_SECONDS: '3600',
    RATE_LIMIT_PER_MIN: '0',
    MAX_POSTS: '10',
  });

  const baseUrl = `http://127.0.0.1:${apiPort}`;
  try {
    await waitHealth(baseUrl);
  } catch (e) {
    fail(`API failed to start: ${e.message}`);
    const snippet = (child.__log() || '').slice(0, 500).replace(token, '[redacted]');
    if (snippet) console.error(snippet);
    await cleanup();
    return 1;
  }

  const environment = {
    baseUrl,
    apiKey: key,
    apiKeyB: '',
    pageUrl: PAGE_CERN,
    unauthorizedPageUrl: PAGE_NASA,
    limit: '10',
    invalidApiKey: 'invalid-key-not-real',
    fakeUpstreamUrl: '',
  };

  // Single paid invocation happens HERE. Newman Folder 02 then validates cache-only follow-ups.
  let liveReport = {
    httpStatus: null,
    postCount: null,
    source: null,
    provider: null,
    pageName: null,
    logoStatus: null,
    images: 0,
    timestamps: 0,
    duplicateIds: 0,
    newestFirst: null,
    firstTs: null,
    lastTs: null,
    cacheSource: null,
    limit3Count: null,
    outboundApify: null,
  };

  try {
    log('Issuing ONE live Apify-backed GET (limit=10, page=cern)…');
    const first = await fetch(
      `${baseUrl}/api/v1/facebook/posts?page=${encodeURIComponent(PAGE_CERN)}&limit=10`,
      { headers: { 'x-api-key': key } },
    );
    liveReport.httpStatus = first.status;
    const body = await first.json();
    if (body?.success) {
      liveReport.postCount = body.data.posts.length;
      liveReport.source = body.meta.source;
      liveReport.provider = body.meta.provider;
      liveReport.pageName = body.data.page.name;
      const logo = body.data.page.logo;
      const fb = body.data.page.logo_fallback;
      liveReport.logoStatus =
        logo === fb || /graph\.facebook\.com\//.test(logo) ? 'fallback' : 'provider';
      liveReport.images = body.data.posts.filter((p) => typeof p.image === 'string' && p.image).length;
      liveReport.timestamps = body.data.posts.filter((p) => p.created_at).length;
      const ids = body.data.posts.map((p) => p.id);
      liveReport.duplicateIds = ids.length - new Set(ids).size;
      const times = body.data.posts.map((p) => p.created_at).filter(Boolean);
      liveReport.firstTs = times[0] || null;
      liveReport.lastTs = times[times.length - 1] || null;
      liveReport.newestFirst = times.every((t, i) => {
        if (i === 0) return true;
        return new Date(times[i - 1]).getTime() >= new Date(t).getTime();
      });
      liveReport.sample = {
        success: body.success,
        page: {
          id: body.data.page.id,
          name: body.data.page.name,
          logo: `${String(body.data.page.logo).slice(0, 80)}${body.data.page.logo.length > 80 ? '…' : ''}`,
          logo_fallback: body.data.page.logo_fallback,
          url: body.data.page.url,
        },
        meta: body.meta,
        posts: body.data.posts.slice(0, 2).map((p) => ({
          id: p.id,
          url: p.url,
          text: (p.text || '').slice(0, 100),
          created_at: p.created_at,
          image: p.image ? `${String(p.image).slice(0, 80)}…` : null,
          mediaCount: p.media.length,
          stats: p.stats,
          pageName: p.page.name,
        })),
      };
    } else {
      liveReport.errorCode = body?.error?.code;
      liveReport.errorMessage = body?.error?.message;
      fail(`Live GET failed: HTTP ${first.status} code=${liveReport.errorCode || '?'}`);
      await cleanup();
      log('REAL FACEBOOK ACCEPTANCE: FAIL');
      return 1;
    }

    try {
      const q = JSON.parse(await readFile(quotaPath, 'utf8'));
      liveReport.outboundApify = q.consumed;
    } catch {
      liveReport.outboundApify = null;
    }

    if (liveReport.outboundApify !== 1) {
      fail(`Expected exactly 1 Apify quota consumption after live GET, got ${liveReport.outboundApify}`);
    }
  } catch (e) {
    fail(`Live probe failed: ${e.message}`);
    await cleanup();
    log('REAL FACEBOOK ACCEPTANCE: FAIL');
    return 1;
  }

  // Folder 02 against warm cache (no additional Apify calls; daily limit already 1/1).
  const { err, summary } = await runNewman({
    folders: ['02 — Real Facebook Posts'],
    environment,
  });
  const s = summarizeNewman(summary);

  try {
    const second = await fetch(
      `${baseUrl}/api/v1/facebook/posts?page=${encodeURIComponent(PAGE_CERN)}&limit=10`,
      { headers: { 'x-api-key': key } },
    );
    const body2 = await second.json();
    liveReport.cacheSource = body2?.meta?.source;

    const third = await fetch(
      `${baseUrl}/api/v1/facebook/posts?page=${encodeURIComponent(PAGE_CERN)}&limit=3`,
      { headers: { 'x-api-key': key } },
    );
    const body3 = await third.json();
    liveReport.limit3Count = body3?.data?.posts?.length;

    const q2 = JSON.parse(await readFile(quotaPath, 'utf8'));
    liveReport.outboundApifyAfterCacheChecks = q2.consumed;
  } catch (e) {
    fail(`Cache follow-up failed: ${e.message}`);
  }

  log('--- LIVE ACCEPTANCE SUMMARY ---');
  log(JSON.stringify(liveReport, null, 2));

  const newmanFailed = (s.assertions.failed || 0) > 0 || !!err || (s.requests.failed || 0) > 0;
  log(`Newman assertions failed=${s.assertions.failed || 0} total=${s.assertions.total || 0}`);
  if (s.failures.length) {
    for (const f of s.failures.slice(0, 15)) fail(`${f.name}: ${f.error}`);
  }

  const acceptancePass =
    !newmanFailed &&
    liveReport.httpStatus === 200 &&
    liveReport.source === 'live' &&
    liveReport.postCount === 10 &&
    liveReport.duplicateIds === 0 &&
    liveReport.cacheSource === 'cache' &&
    liveReport.limit3Count === 3 &&
    liveReport.outboundApify === 1 &&
    liveReport.outboundApifyAfterCacheChecks === 1 &&
    liveReport.newestFirst === true;

  await cleanup();
  // Preserve liveCache for later read-only testing.

  if (acceptancePass) {
    log('REAL FACEBOOK ACCEPTANCE: PASS');
    return 0;
  }
  log('REAL FACEBOOK ACCEPTANCE: FAIL');
  return 1;
}

async function readQuotaConsumed(quotaPath) {
  try {
    const q = JSON.parse(await readFile(quotaPath, 'utf8'));
    const today = new Date().toISOString().slice(0, 10);
    if (!q || q.utcDate !== today) return 0;
    return Number.isInteger(q.consumed) ? q.consumed : 0;
  } catch (e) {
    if (e && e.code === 'ENOENT') return 0;
    throw e;
  }
}

async function runServe() {
  let flags;
  try {
    flags = parseServeFlags(process.argv);
  } catch (e) {
    fail(e.message || String(e));
    return 2;
  }

  const { live, dailyLimit } = flags;
  log(
    `== postman:serve (${live ? `LIVE daily-limit=${dailyLimit} (TOTAL UTC-day invocations)` : 'cache-only'}) ==`,
  );
  await mkdir(localDir, { recursive: true });

  const dotenv = await readDotEnv();
  const key = `gui${randomKey(16)}`;
  const apiPort = await freePort();
  // Shared with postman:live — preserves CERN (and other) captures + quota.
  const cacheDir = sharedCacheDir;
  await mkdir(cacheDir, { recursive: true });
  const quotaPath = join(cacheDir, 'apify-quota.json');

  let alreadyConsumed = 0;
  try {
    alreadyConsumed = await readQuotaConsumed(quotaPath);
  } catch (e) {
    fail(`Shared quota file unreadable (${quotaPath}): ${e.message}`);
    return 3;
  }

  const env = {
    HOST: '127.0.0.1',
    PORT: String(apiPort),
    CACHE_DIR: cacheDir,
    API_KEYS: `gui:${key}`,
    WARM_PAGES: '',
    PROVIDERS: 'apify',
    UPSTREAM_RETRIES: '0',
    RATE_LIMIT_PER_MIN: '0',
    MAX_POSTS: '10',
    FRESH_TTL_SECONDS: '3600',
  };

  if (live) {
    const token = (dotenv.APIFY_TOKEN || '').trim();
    if (!token) {
      fail('APIFY_TOKEN required for postman:serve --live');
      return 2;
    }
    if (alreadyConsumed >= dailyLimit) {
      fail(
        `Shared quota already at ${alreadyConsumed}/${dailyLimit} for today. ` +
          'Cached pages still work with: npm run postman:serve. ' +
          'To allow more TOTAL invocations today (not extra free calls): ' +
          `npm run postman:serve -- --live --daily-limit=${Math.min(alreadyConsumed + 1, 10)} ` +
          '(does not reset prior consumption).',
      );
      return 3;
    }
    env.APIFY_TOKEN = token;
    env.APIFY_DAILY_RUN_LIMIT = String(dailyLimit);
    env.APIFY_MAX_CHARGE_USD_PER_RUN = resolveMaxChargeUsd(dotenv);
    env.APIFY_BASE_URL = dotenv.APIFY_BASE_URL || 'https://api.apify.com';
    env.APIFY_ACTOR = dotenv.APIFY_ACTOR || 'apify~facebook-posts-scraper';
    if (dotenv.APIFY_INPUT && String(dotenv.APIFY_INPUT).trim()) {
      env.APIFY_INPUT = dotenv.APIFY_INPUT;
    }
    log(
      `Shared cache: ${cacheDir} | quota so far today: ${alreadyConsumed}/${dailyLimit} ` +
        `(--daily-limit is TOTAL daily invocations, not additional calls, not USD).`,
    );
    log('No Apify call on startup — only an explicit Postman Send to an uncached page can scrape.');
  } else {
    env.APIFY_TOKEN = dotenv.APIFY_TOKEN || '';
    env.APIFY_DAILY_RUN_LIMIT = '0';
    log(`Shared cache (read/serve): ${cacheDir}`);
    log(
      'Cache-only mode (APIFY_DAILY_RUN_LIMIT=0). Previously captured pages (e.g. CERN) are served from disk; new pages will not scrape.',
    );
    log('Controlled live: npm run postman:serve -- --live [--daily-limit=3]');
  }

  const child = spawnApi(env);
  const baseUrl = `http://127.0.0.1:${apiPort}`;
  await waitHealth(baseUrl);

  // Confirm warmer did not fire (no automatic scrape).
  const bootLog = child.__log();
  if (/cache warmer: \d+ page/.test(bootLog)) {
    fail('Unexpected cache warmer activity at startup');
    await cleanup();
    return 1;
  }

  const envPath = join(localDir, 'Facebook-Posts-Local.generated.postman_environment.json');
  const envDoc = {
    id: 'fb-posts-local-generated',
    name: 'Facebook Posts API — Local Generated',
    values: envValues({
      baseUrl,
      apiKey: key,
      apiKeyB: '',
      pageUrl: PAGE_CERN,
      unauthorizedPageUrl: PAGE_NASA,
      limit: '10',
      invalidApiKey: 'invalid-key-not-real',
      fakeUpstreamUrl: '',
    }),
    _postman_variable_scope: 'environment',
  };
  await writeFile(envPath, `${JSON.stringify(envDoc, null, 2)}\n`, 'utf8');

  log(`Listening: ${baseUrl}`);
  log(`CACHE_DIR: ${cacheDir}`);
  log(`Import environment (gitignored): ${envPath}`);
  log('Import collection: postman/Facebook-Posts-API.postman_collection.json');
  log('Select the generated environment, open Folder 02 → Get Latest 10 Posts.');
  log('Change only pageUrl / limit in the environment, then press Send.');
  log('meta.source=cache|stale-cache means no new Apify call; meta.source=live means a scrape ran.');
  log('WARNING: Importing a populated environment into a synced Postman workspace may upload variable values.');
  log('The generated API key is in the environment file only — it is not printed here. Never put APIFY_TOKEN in Postman.');
  log('Press Ctrl+C to stop.');

  const shutdown = async () => {
    log('[serve] shutting down…');
    await cleanup();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await new Promise(() => {});
}

async function main() {
  const mode = (process.argv[2] || '').toLowerCase();
  if (!['offline', 'live', 'serve'].includes(mode)) {
    console.error(
      'Usage:\n' +
        '  node scripts/postman-runner.js offline\n' +
        '  node scripts/postman-runner.js live\n' +
        '  node scripts/postman-runner.js serve\n' +
        '  node scripts/postman-runner.js serve --live\n' +
        '  node scripts/postman-runner.js serve --live --daily-limit=3',
    );
    process.exit(2);
  }

  process.on('uncaughtException', async (e) => {
    fail(e.message || String(e));
    await cleanup();
    process.exit(1);
  });

  let code = 1;
  try {
    if (mode === 'offline') code = await runOffline();
    else if (mode === 'live') code = await runLive();
    else code = await runServe();
  } catch (e) {
    fail(e?.stack || e?.message || String(e));
    code = 1;
  } finally {
    if (mode !== 'serve') await cleanup();
  }
  process.exit(code);
}

main();
