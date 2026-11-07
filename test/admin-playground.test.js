import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/server.js';
import { createService } from '../src/service.js';
import { SESSION_COOKIE, CSRF_COOKIE } from '../src/management/sessions.js';
import { MANAGEMENT_SCHEMA_VERSION } from '../src/management/db.js';

const ORIGIN = 'http://127.0.0.1:3200';
const TOKEN = 'bootstrap-playground-token-32chars!!';
const INTERNAL = 'internal-playground-secret-32chars';
const ENC_KEY = Buffer.alloc(32, 9).toString('base64');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pg-test-'));
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

async function start({ providers, seedCache } = {}) {
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
    ALLOWED_PAGES: 'cern',
    INSTAGRAM_ALLOWED_PROFILES: 'nasa',
    MAX_POSTS: '10',
    APIFY_DAILY_RUN_LIMIT: '5',
  });

  let fetchCount = 0;
  const fakeProviders = providers || [
    {
      name: 'apify',
      supports: (ref) => !String(ref.key).startsWith('instagram:'),
      async fetch(ref, limit) {
        fetchCount += 1;
        return {
          page: {
            id: '1',
            name: 'CERN',
            logo: 'https://example.com/logo.png',
            logo_fallback: 'https://example.com/fallback.png',
            url: 'https://www.facebook.com/cern',
          },
          posts: [
            {
              id: 'p1',
              url: 'https://www.facebook.com/cern/posts/1',
              text: 'Hello <script>alert(1)</script>',
              created_at: new Date().toISOString(),
              image: 'https://example.com/post.jpg',
              media: [{ type: 'image', url: 'https://example.com/post.jpg', thumbnail: null }],
              stats: { likes: 1, comments: 0, shares: 0 },
              page: {
                id: '1',
                name: 'CERN',
                logo: 'https://example.com/logo.png',
                logo_fallback: 'https://example.com/fallback.png',
                url: 'https://www.facebook.com/cern',
              },
            },
          ].slice(0, limit),
        };
      },
      quota: undefined,
    },
  ];

  const service = createService(config, fakeProviders);
  // Attach shared quota from service to fake provider for prepare checks
  if (fakeProviders[0] && !fakeProviders[0].quota) {
    fakeProviders[0].quota = service.quota;
  }

  if (seedCache) {
    await service.cache.set('cern', {
      key: 'cern',
      fetchedAt: Date.now() - 60_000,
      provider: 'apify',
      page: {
        id: '1',
        name: 'CERN',
        logo: 'https://example.com/logo.png',
        logo_fallback: 'https://example.com/fallback.png',
        url: 'https://www.facebook.com/cern',
      },
      posts: [
        {
          id: 'cached1',
          url: 'https://www.facebook.com/cern/posts/c1',
          text: 'Cached post',
          created_at: new Date().toISOString(),
          image: null,
          media: [],
          stats: { likes: 2, comments: 1, shares: 0 },
          page: {
            id: '1',
            name: 'CERN',
            logo: 'https://example.com/logo.png',
            logo_fallback: 'https://example.com/fallback.png',
            url: 'https://www.facebook.com/cern',
          },
        },
      ],
    });
  }

  const server = createApp(config, service);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const setup = await json(base, 'POST', '/api/v1/admin/setup', {
    body: {
      setupToken: TOKEN,
      email: 'pg-admin@example.com',
      password: 'correct-horse-battery',
      confirmPassword: 'correct-horse-battery',
    },
    headers: { origin: ORIGIN, 'x-admin-internal-secret': INTERNAL },
  });
  assert.equal(setup.status, 201, JSON.stringify(setup.body));

  return {
    server,
    base,
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

test('management schema includes playground confirmations (v4)', async () => {
  assert.equal(MANAGEMENT_SCHEMA_VERSION, 4);
  const ctx = await start();
  try {
    const tables = ctx.service; // ensure app opened hub
    const hub = ctx.server.getHub();
    const names = hub.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
    assert.ok(names.includes('playground_confirmations'));
    void tables;
  } finally {
    ctx.close();
  }
});

test('cache-only returns seeded data with zero provider calls', async () => {
  const ctx = await start({ seedCache: true });
  try {
    const before = ctx.fetchCount();
    const hit = await json(ctx.base, 'GET', '/api/v1/admin/playground/cache?platform=facebook&username=cern&limit=5', {
      headers: { 'x-admin-session': ctx.session },
    });
    assert.equal(hit.status, 200, JSON.stringify(hit.body));
    assert.equal(hit.body.success, true);
    assert.equal(hit.body.data.posts[0].id, 'cached1');
    assert.ok(['cache', 'stale-cache'].includes(hit.body.meta.source));
    assert.equal(hit.body.meta.mode, 'cache');
    assert.equal(ctx.fetchCount(), before);

    const miss = await json(ctx.base, 'GET', '/api/v1/admin/playground/cache?platform=facebook&username=missingpage&limit=5', {
      headers: { 'x-admin-session': ctx.session },
    });
    // missingpage not in allowlist
    assert.equal(miss.status, 403);

    const missAllowed = await json(ctx.base, 'GET', '/api/v1/admin/playground/cache?platform=facebook&username=cern&limit=5', {
      headers: {},
    });
    assert.equal(missAllowed.status, 401);
    assert.equal(ctx.fetchCount(), before);
  } finally {
    ctx.close();
  }
});

test('stale cache-only does not schedule background refresh', async () => {
  const ctx = await start();
  try {
    await ctx.service.cache.set('cern', {
      key: 'cern',
      fetchedAt: Date.now() - 48 * 60 * 60 * 1000,
      provider: 'apify',
      page: { id: '1', name: 'CERN', logo: 'https://example.com/a.png', logo_fallback: 'https://example.com/b.png', url: 'https://www.facebook.com/cern' },
      posts: [{
        id: 'old',
        url: 'https://www.facebook.com/cern/posts/old',
        text: 'stale',
        created_at: new Date().toISOString(),
        image: null,
        media: [],
        stats: { likes: 0, comments: 0, shares: 0 },
        page: { id: '1', name: 'CERN', logo: 'https://example.com/a.png', logo_fallback: 'https://example.com/b.png', url: 'https://www.facebook.com/cern' },
      }],
    });
    const before = ctx.fetchCount();
    const hit = await json(ctx.base, 'GET', '/api/v1/admin/playground/cache?platform=facebook&username=cern&limit=3', {
      headers: { 'x-admin-session': ctx.session },
    });
    assert.equal(hit.status, 200);
    assert.equal(hit.body.meta.source, 'stale-cache');
    assert.equal(hit.body.meta.stale, true);
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(ctx.fetchCount(), before);
  } finally {
    ctx.close();
  }
});

test('prepare/cancel/confirm lifecycle; replay and CSRF', async () => {
  const ctx = await start({ seedCache: true });
  try {
    const prep = await json(ctx.base, 'POST', '/api/v1/admin/playground/prepare', {
      body: { platform: 'facebook', username: 'cern', limit: 3 },
      headers: authHeaders(ctx.session, ctx.csrf),
    });
    assert.equal(prep.status, 200, JSON.stringify(prep.body));
    assert.ok(prep.body.data.confirmationToken);
    assert.ok(prep.body.data.quota);

    const cancel = await json(ctx.base, 'POST', '/api/v1/admin/playground/cancel', {
      body: { confirmationToken: prep.body.data.confirmationToken },
      headers: authHeaders(ctx.session, ctx.csrf),
    });
    assert.equal(cancel.status, 200);
    assert.equal(ctx.fetchCount(), 0);

    const prep2 = await json(ctx.base, 'POST', '/api/v1/admin/playground/prepare', {
      body: { platform: 'facebook', username: 'cern', limit: 3 },
      headers: authHeaders(ctx.session, ctx.csrf),
    });
    const token = prep2.body.data.confirmationToken;

    const noCsrf = await json(ctx.base, 'POST', '/api/v1/admin/playground/confirm', {
      body: { confirmationToken: token },
      headers: {
        origin: ORIGIN,
        'x-admin-session': ctx.session,
        'x-admin-internal-secret': INTERNAL,
      },
    });
    // Internal secret bypasses CSRF in assertMutationOrigin but requireSession still checks CSRF header
    // Without csrf header → CSRF_REJECTED
    assert.equal(noCsrf.status, 403);

    const ok = await json(ctx.base, 'POST', '/api/v1/admin/playground/confirm', {
      body: { confirmationToken: token },
      headers: authHeaders(ctx.session, ctx.csrf),
    });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.meta.mode, 'live');
    assert.equal(ok.body.meta.source, 'live');
    assert.equal(ctx.fetchCount(), 1);

    const replay = await json(ctx.base, 'POST', '/api/v1/admin/playground/confirm', {
      body: { confirmationToken: token },
      headers: authHeaders(ctx.session, ctx.csrf),
    });
    assert.equal(replay.status, 409);

    // Public API still requires x-api-key
    const publicPosts = await json(ctx.base, 'GET', '/api/v1/facebook/posts?page=cern&limit=3', {
      headers: { 'x-api-key': 'secret123' },
    });
    assert.equal(publicPosts.status, 200);
  } finally {
    ctx.close();
  }
});

test('out-of-allowlist and unauthenticated prepare rejected', async () => {
  const ctx = await start();
  try {
    const forbidden = await json(ctx.base, 'POST', '/api/v1/admin/playground/prepare', {
      body: { platform: 'facebook', username: 'notallowed', limit: 3 },
      headers: authHeaders(ctx.session, ctx.csrf),
    });
    assert.equal(forbidden.status, 403);

    const unauth = await json(ctx.base, 'POST', '/api/v1/admin/playground/prepare', {
      body: { platform: 'facebook', username: 'cern', limit: 3 },
      headers: { origin: ORIGIN },
    });
    assert.equal(unauth.status, 401);
  } finally {
    ctx.close();
  }
});
