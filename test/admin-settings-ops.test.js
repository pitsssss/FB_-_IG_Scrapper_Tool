import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/server.js';
import { createService } from '../src/service.js';
import { composeAllowlist } from '../src/management/settings.js';
import { Cache } from '../src/cache.js';
import { createApifyQuota } from '../src/apifyQuota.js';

const ORIGIN = 'http://127.0.0.1:3300';
const TOKEN = 'bootstrap-settings-ops-token-32ch!!';
const INTERNAL = 'internal-settings-ops-secret-32ch';
const ENC_KEY = Buffer.alloc(32, 11).toString('base64');
const PASSWORD = 'SettingsOpsPass1!';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'settings-ops-'));
}

async function json(base, method, pathname, { body, headers = {} } = {}) {
  const res = await fetch(`${base}${pathname}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed, res };
}

function authHeaders(session, csrf) {
  return {
    origin: ORIGIN,
    'x-admin-session': session,
    'x-csrf-token': csrf,
    'x-admin-internal-secret': INTERNAL,
  };
}

async function start(extraEnv = {}) {
  const managementDir = tmp();
  const cacheDir = tmp();
  const config = loadConfig({
    API_KEYS: 'testsite:secret123',
    PROVIDERS: 'apify',
    APIFY_TOKEN: 'test-token-not-used',
    CACHE_DIR: cacheDir,
    MANAGEMENT_DIR: managementDir,
    BOOTSTRAP_SETUP_TOKEN: TOKEN,
    ADMIN_ALLOWED_ORIGINS: ORIGIN,
    ADMIN_INTERNAL_SECRET: INTERNAL,
    ADMIN_COOKIE_SECURE: '0',
    DATA_ENCRYPTION_KEY: ENC_KEY,
    UPSTREAM_RETRIES: '0',
    ALLOWED_PAGES: 'cern,esa',
    INSTAGRAM_ALLOWED_PROFILES: 'nasa,natgeo',
    MAX_POSTS: '10',
    APIFY_DAILY_RUN_LIMIT: '8',
    ...extraEnv,
  });

  let fetchCount = 0;
  const fakeProviders = [
    {
      name: 'apify',
      supports: () => true,
      async fetch(ref) {
        fetchCount += 1;
        const isIg = String(ref.key).startsWith('instagram:');
        return {
          page: {
            id: '1',
            name: isIg ? 'NASA' : 'CERN',
            logo: 'https://example.com/logo.png',
            logo_fallback: 'https://example.com/fallback.png',
            url: isIg ? 'https://www.instagram.com/nasa/' : 'https://www.facebook.com/cern',
          },
          posts: [{
            id: 'p1',
            text: 'hello',
            created_time: new Date().toISOString(),
            permalink: isIg ? 'https://www.instagram.com/p/x/' : 'https://www.facebook.com/cern/posts/1',
            media: [],
            stats: { likes: 1, comments: 0, shares: 0 },
          }],
        };
      },
    },
  ];

  const service = createService(config, fakeProviders);
  const server = createApp(config, service);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  server.getHub();

  const setup = await json(base, 'POST', '/api/v1/admin/setup', {
    body: {
      email: 'ops-admin@example.com',
      password: PASSWORD,
      confirmPassword: PASSWORD,
      setupToken: TOKEN,
    },
    headers: { origin: ORIGIN, 'x-admin-internal-secret': INTERNAL },
  });
  assert.equal(setup.status, 201, JSON.stringify(setup.body));

  return {
    base,
    config,
    service,
    cacheDir,
    managementDir,
    session: setup.body.data.sessionToken,
    csrf: setup.body.data.csrfToken,
    fetchCount: () => fetchCount,
    close() {
      server.closeAuth?.();
      server.close();
    },
  };
}

test('composeAllowlist never expands beyond env and supports deny-all override', () => {
  assert.deepEqual(composeAllowlist(['cern', 'esa'], null).effective, ['cern', 'esa']);
  assert.equal(composeAllowlist([], null).mode, 'unrestricted');
  assert.deepEqual(composeAllowlist(['cern', 'esa'], ['cern']).effective, ['cern']);
  assert.deepEqual(composeAllowlist(['cern'], ['evil']).effective, []);
  assert.deepEqual(composeAllowlist(['cern'], []).effective, []);
  assert.equal(composeAllowlist(['cern'], []).mode, 'deny-all');
  assert.deepEqual(composeAllowlist([], ['cern']).effective, ['cern']);
  assert.deepEqual(composeAllowlist([], []).effective, []);
  assert.equal(composeAllowlist([], []).mode, 'deny-all');
});

test('cache delete removes memory and disk without provider or quota mutation', async () => {
  const ctx = await start();
  try {
    const key = 'cern';
    const file = path.join(ctx.cacheDir, `${createHash('sha1').update(key).digest('hex')}.json`);
    await ctx.service.cache.set(key, {
      key,
      fetchedAt: Date.now(),
      provider: 'apify',
      page: { id: '1', name: 'CERN', logo: null, logo_fallback: null, url: 'https://www.facebook.com/cern' },
      posts: [{ id: '1', text: 'x', created_time: new Date().toISOString(), permalink: 'https://www.facebook.com/cern/posts/1', media: [], stats: { likes: 0, comments: 0, shares: 0 } }],
    });
    assert.equal(fs.existsSync(file), true);
    assert.equal(ctx.service.cache.hasMemory(key), true);

    const quotaBefore = await ctx.service.quota.getStatus();
    const fetches = ctx.fetchCount();

    const denied = await json(ctx.base, 'POST', '/api/v1/admin/cache/delete', {
      body: { platform: 'facebook', username: 'cern', confirm: true, currentPassword: 'wrong' },
      headers: authHeaders(ctx.session, ctx.csrf),
    });
    assert.equal(denied.status, 401);

    const noConfirm = await json(ctx.base, 'POST', '/api/v1/admin/cache/delete', {
      body: { platform: 'facebook', username: 'cern', currentPassword: PASSWORD },
      headers: authHeaders(ctx.session, ctx.csrf),
    });
    assert.equal(noConfirm.status, 400);

    const ok = await json(ctx.base, 'POST', '/api/v1/admin/cache/delete', {
      body: {
        platform: 'facebook',
        username: 'cern',
        confirm: true,
        currentPassword: PASSWORD,
      },
      headers: authHeaders(ctx.session, ctx.csrf),
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ctx.service.cache.hasMemory(key), false);
    assert.equal(fs.existsSync(file), false);
    assert.equal(ctx.fetchCount(), fetches);
    const quotaAfter = await ctx.service.quota.getStatus();
    assert.equal(quotaAfter.consumed, quotaBefore.consumed);

    // sibling entry intact
    await ctx.service.cache.set('esa', {
      key: 'esa',
      fetchedAt: Date.now(),
      provider: 'apify',
      page: { id: '2', name: 'ESA', logo: null, logo_fallback: null, url: 'https://www.facebook.com/esa' },
      posts: [{ id: '2', text: 'y', created_time: new Date().toISOString(), permalink: 'https://www.facebook.com/esa/posts/1', media: [], stats: { likes: 0, comments: 0, shares: 0 } }],
    });
    const list = await json(ctx.base, 'GET', '/api/v1/admin/cache', {
      headers: authHeaders(ctx.session, ctx.csrf),
    });
    assert.equal(list.status, 200);
    const names = (list.body.data.entries || []).map((e) => e.username);
    assert.ok(names.includes('esa'));
    assert.ok(!names.includes('cern'));
  } finally {
    ctx.close();
  }
});

test('settings patch validates, applies allowlist hot, respects daily ceiling', async () => {
  const ctx = await start();
  try {
    const unknown = await json(ctx.base, 'PATCH', '/api/v1/admin/settings', {
      body: { settings: { not_a_real_key: 1 } },
      headers: authHeaders(ctx.session, ctx.csrf),
    });
    assert.equal(unknown.status, 400);
    assert.equal(unknown.body.error.code, 'UNKNOWN_SETTING');

    const overCeiling = await json(ctx.base, 'PATCH', '/api/v1/admin/settings', {
      body: { settings: { apify_daily_run_limit: 99 } },
      headers: authHeaders(ctx.session, ctx.csrf),
    });
    assert.equal(overCeiling.status, 400);
    assert.equal(overCeiling.body.error.code, 'CEILING_EXCEEDED');

    const lower = await json(ctx.base, 'PATCH', '/api/v1/admin/settings', {
      body: { settings: { apify_daily_run_limit: 2, allowed_facebook: ['cern'] } },
      headers: authHeaders(ctx.session, ctx.csrf),
    });
    assert.equal(lower.status, 200, JSON.stringify(lower.body));
    assert.equal(ctx.config.apify.dailyRunLimit, 2);
    assert.deepEqual(ctx.config.allowedPages, ['cern']);
    assert.equal(ctx.service.quota.getDailyLimit(), 2);

    // esa no longer allowed on public API
    const denied = await json(ctx.base, 'GET', '/api/v1/facebook/posts?page=esa&limit=1', {
      headers: { 'x-api-key': 'secret123' },
    });
    assert.equal(denied.status, 403);

    const allowed = await json(ctx.base, 'GET', '/api/v1/facebook/posts?page=cern&limit=1', {
      headers: { 'x-api-key': 'secret123' },
    });
    assert.equal(allowed.status, 200);

    // cannot expand beyond env
    const expand = await json(ctx.base, 'PATCH', '/api/v1/admin/settings', {
      body: { settings: { allowed_facebook: ['cern', 'evilcorp'] } },
      headers: authHeaders(ctx.session, ctx.csrf),
    });
    assert.equal(expand.status, 200);
    assert.deepEqual(ctx.config.allowedPages, ['cern']);

    const warmNeedConfirm = await json(ctx.base, 'PATCH', '/api/v1/admin/settings', {
      body: { settings: { warm_enabled: true, warm_facebook: ['cern'] } },
      headers: authHeaders(ctx.session, ctx.csrf),
    });
    assert.equal(warmNeedConfirm.status, 400);
    assert.equal(warmNeedConfirm.body.error.code, 'CONFIRMATION_REQUIRED');

    const warmOk = await json(ctx.base, 'PATCH', '/api/v1/admin/settings', {
      body: {
        settings: { warm_enabled: true, warm_facebook: ['cern'] },
        confirmWarmEnable: true,
      },
      headers: authHeaders(ctx.session, ctx.csrf),
    });
    assert.equal(warmOk.status, 200);
    assert.ok(warmOk.body.data.pendingRestart.includes('warm_enabled'));
  } finally {
    ctx.close();
  }
});

test('usage telemetry distinguishes cache hits from provider attempts', async () => {
  const ctx = await start();
  try {
    await json(ctx.base, 'GET', '/api/v1/facebook/posts?page=cern&limit=1', {
      headers: { 'x-api-key': 'secret123' },
    });
    const cached = await json(ctx.base, 'GET', '/api/v1/facebook/posts?page=cern&limit=1', {
      headers: { 'x-api-key': 'secret123' },
    });
    assert.equal(cached.body.meta.source, 'cache');

    const summary = await json(ctx.base, 'GET', '/api/v1/admin/usage/summary?period=today', {
      headers: authHeaders(ctx.session, ctx.csrf),
    });
    assert.equal(summary.status, 200, JSON.stringify(summary.body));
    const c = summary.body.data.counts;
    assert.ok(c.publicRequests >= 2);
    assert.ok(c.cacheHits >= 1);
    assert.ok(c.liveResponses >= 1);
    assert.ok(c.providerAttempts >= 1);
    // second request was cache — providerAttempts should be less than publicRequests
    assert.ok(c.providerAttempts < c.publicRequests);

    const events = await json(ctx.base, 'GET', '/api/v1/admin/usage/events?period=today&limit=20', {
      headers: authHeaders(ctx.session, ctx.csrf),
    });
    assert.equal(events.status, 200);
    assert.ok(Array.isArray(events.body.data.events));
    const blob = JSON.stringify(events.body.data.events);
    assert.ok(!blob.includes('secret123'));
    assert.ok(!blob.includes(PASSWORD));
  } finally {
    ctx.close();
  }
});

test('quota setDailyLimit does not reset consumed', async () => {
  const dir = tmp();
  const q = createApifyQuota({ stateDir: dir, dailyLimit: 5 });
  assert.equal((await q.reserve()).ok, true);
  assert.equal((await q.reserve()).ok, true);
  q.setDailyLimit(3);
  const status = await q.getStatus();
  assert.equal(status.consumed, 2);
  assert.equal(status.dailyLimit, 3);
  assert.equal(status.remaining, 1);
});

test('Cache.delete rejects path traversal style keys', async () => {
  const dir = tmp();
  const cache = new Cache(dir);
  const bad = await cache.delete('../etc/passwd');
  assert.equal(bad.ok, false);
});

test('unauthenticated settings and cache delete rejected', async () => {
  const ctx = await start();
  try {
    const s = await json(ctx.base, 'GET', '/api/v1/admin/settings');
    assert.equal(s.status, 401);
    const d = await json(ctx.base, 'POST', '/api/v1/admin/cache/delete', {
      body: { platform: 'facebook', username: 'cern', confirm: true, currentPassword: PASSWORD },
      headers: { origin: ORIGIN },
    });
    assert.equal(d.status, 401);
    const csrfBad = await json(ctx.base, 'PATCH', '/api/v1/admin/settings', {
      body: { settings: { fresh_ttl_seconds: 120 } },
      headers: {
        origin: ORIGIN,
        'x-admin-session': ctx.session,
        'x-admin-internal-secret': INTERNAL,
      },
    });
    assert.equal(csrfBad.status, 403);
  } finally {
    ctx.close();
  }
});
