import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/server.js';
import { createService } from '../src/service.js';

const ORIGIN = 'http://127.0.0.1:3100';
const BOOT = 'bootstrap-apikeys-test-token-32ch!!';
const INTERNAL = 'internal-bff-secret-for-apikey-tests';
const ENC_KEY = randomBytes(32).toString('base64');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mgmt-keys-'));
}

async function json(base, method, pathname, { body, headers = {} } = {}) {
  const res = await fetch(`${base}${pathname}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json(), res };
}

async function start() {
  const managementDir = tmp();
  const cacheDir = tmp();
  const mock = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify([{
        postId: 'p1', url: 'https://www.facebook.com/cern/posts/p1',
        text: 'hi', time: '2026-01-01T00:00:00Z', likes: 1, comments: 0, shares: 0,
        pageName: 'CERN', user: { id: '1', name: 'CERN', profilePic: 'https://cdn.example/a.jpg' },
        media: [],
      }]));
    });
  });
  await new Promise((r) => mock.listen(0, '127.0.0.1', r));
  const mockUrl = `http://127.0.0.1:${mock.address().port}`;

  const config = loadConfig({
    API_KEYS: 'envsite:envsecret999',
    API_KEY_PAGE_SCOPES: JSON.stringify({ envsite: ['cern'] }),
    APIFY_TOKEN: 'tkn',
    APIFY_BASE_URL: mockUrl,
    PROVIDERS: 'apify',
    CACHE_DIR: cacheDir,
    MANAGEMENT_DIR: managementDir,
    BOOTSTRAP_SETUP_TOKEN: BOOT,
    ADMIN_ALLOWED_ORIGINS: ORIGIN,
    ADMIN_INTERNAL_SECRET: INTERNAL,
    ADMIN_COOKIE_SECURE: '0',
    DATA_ENCRYPTION_KEY: ENC_KEY,
    UPSTREAM_RETRIES: '0',
    RETRY_BACKOFF_MS: '1',
  });
  const service = createService(config);
  const server = createApp(config, service, {
    hubOptions: { getEncryptionKey: () => ENC_KEY },
  });
  server.getHub();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const setup = await json(base, 'POST', '/api/v1/admin/setup', {
    body: {
      setupToken: BOOT,
      username: 'admin',
      password: 'correct-horse-battery',
      confirmPassword: 'correct-horse-battery',
    },
    headers: { origin: ORIGIN, 'x-admin-internal-secret': INTERNAL },
  });
  assert.equal(setup.status, 201);

  return {
    server, base, mock, cacheDir, managementDir, service,
    authHeaders: {
      origin: ORIGIN,
      'x-admin-session': setup.body.data.sessionToken,
      'x-csrf-token': setup.body.data.csrfToken,
    },
  };
}

test('managed API key lifecycle: create once, auth, revoke, rotate, scopes, env still works', async () => {
  const ctx = await start();
  try {
    const emptyScopes = await json(ctx.base, 'POST', '/api/v1/admin/api-keys', {
      body: { clientName: 'siteA', scopes: { facebook: [], instagram: [] } },
      headers: ctx.authHeaders,
    });
    assert.equal(emptyScopes.status, 400);

    const created = await json(ctx.base, 'POST', '/api/v1/admin/api-keys', {
      body: {
        clientName: 'siteA',
        scopes: { facebook: ['cern'], instagram: ['nasa'] },
      },
      headers: ctx.authHeaders,
    });
    assert.equal(created.status, 201);
    assert.ok(created.body.data.key.startsWith('smp_'));
    const rawKey = created.body.data.key;
    const keyId = created.body.data.meta.id;

    const list1 = await json(ctx.base, 'GET', '/api/v1/admin/api-keys', {
      headers: { 'x-admin-session': ctx.authHeaders['x-admin-session'] },
    });
    assert.equal(list1.status, 200);
    assert.equal(JSON.stringify(list1.body).includes(rawKey), false);
    assert.ok(list1.body.data.environment.some((k) => k.clientName === 'envsite'));
    assert.equal(list1.body.data.managed[0].scopes.facebook.includes('cern'), true);
    assert.equal(list1.body.data.managed[0].scopes.instagram.includes('nasa'), true);

    // collision with env name
    const coll = await json(ctx.base, 'POST', '/api/v1/admin/api-keys', {
      body: { clientName: 'envsite', scopes: { facebook: ['cern'] } },
      headers: ctx.authHeaders,
    });
    assert.equal(coll.status, 409);

    // managed key authenticates
    const posts = await fetch(`${ctx.base}/api/v1/facebook/posts?page=cern&limit=1`, {
      headers: { 'x-api-key': rawKey },
    });
    assert.equal(posts.status, 200);

    // cross-platform: facebook scope cannot hit instagram nasa with wrong platform isolation —
    // siteA has instagram:nasa so IG should work; facebook-only scope would fail
    const ig = await fetch(`${ctx.base}/api/v1/instagram/posts?page=nasa&limit=1`, {
      headers: { 'x-api-key': rawKey },
    });
    // may 200 or 502 depending on IG fixture; must not be 403
    assert.notEqual(ig.status, 403);
    assert.notEqual(ig.status, 401);

    // same username different platform: remove ig scope, facebook cern should not grant instagram:cern
    const scoped = await json(ctx.base, 'PUT', `/api/v1/admin/api-keys/${keyId}/scopes`, {
      body: { scopes: { facebook: ['cern'], instagram: [] } },
      headers: ctx.authHeaders,
    });
    assert.equal(scoped.status, 200);
    const igDenied = await fetch(`${ctx.base}/api/v1/instagram/posts?page=cern&limit=1`, {
      headers: { 'x-api-key': rawKey },
    });
    assert.equal(igDenied.status, 403);

    // env key still works
    const envPosts = await fetch(`${ctx.base}/api/v1/facebook/posts?page=cern&limit=1`, {
      headers: { 'x-api-key': 'envsecret999' },
    });
    assert.equal(envPosts.status, 200);

    // rotate
    const rotated = await json(ctx.base, 'POST', `/api/v1/admin/api-keys/${keyId}/rotate`, {
      headers: ctx.authHeaders,
    });
    assert.equal(rotated.status, 200);
    const newKey = rotated.body.data.key;
    assert.notEqual(newKey, rawKey);
    const oldAuth = await fetch(`${ctx.base}/api/v1/facebook/posts?page=cern&limit=1`, {
      headers: { 'x-api-key': rawKey },
    });
    assert.equal(oldAuth.status, 401);
    const newAuth = await fetch(`${ctx.base}/api/v1/facebook/posts?page=cern&limit=1`, {
      headers: { 'x-api-key': newKey },
    });
    assert.equal(newAuth.status, 200);

    // revoke
    const revoked = await json(ctx.base, 'POST', `/api/v1/admin/api-keys/${keyId}/revoke`, {
      headers: ctx.authHeaders,
    });
    assert.equal(revoked.status, 200);
    const afterRevoke = await fetch(`${ctx.base}/api/v1/facebook/posts?page=cern&limit=1`, {
      headers: { 'x-api-key': newKey },
    });
    assert.equal(afterRevoke.status, 401);

    // admin session cannot call posts
    const adminAsKey = await fetch(`${ctx.base}/api/v1/facebook/posts?page=cern&limit=1`, {
      headers: { cookie: `smp_admin_session=${ctx.authHeaders['x-admin-session']}` },
    });
    assert.equal(adminAsKey.status, 401);

    // api key cannot call admin
    const keyAsAdmin = await json(ctx.base, 'GET', '/api/v1/admin/api-keys', {
      headers: { 'x-api-key': 'envsecret999' },
    });
    assert.equal(keyAsAdmin.status, 401);

    // CSRF missing on mutation
    const noCsrf = await json(ctx.base, 'POST', '/api/v1/admin/api-keys', {
      body: { clientName: 'siteB', scopes: { facebook: ['cern'] } },
      headers: {
        origin: ORIGIN,
        'x-admin-session': ctx.authHeaders['x-admin-session'],
      },
    });
    assert.equal(noCsrf.status, 403);
  } finally {
    ctx.server.closeAuth?.();
    ctx.server.close();
    ctx.mock.close();
  }
});

test('empty API_KEYS allows admin bootstrap; posts stay 401 until managed key', async () => {
  const managementDir = tmp();
  const config = loadConfig({
    API_KEYS: '',
    CACHE_DIR: tmp(),
    MANAGEMENT_DIR: managementDir,
    BOOTSTRAP_SETUP_TOKEN: BOOT,
    ADMIN_ALLOWED_ORIGINS: ORIGIN,
    ADMIN_INTERNAL_SECRET: INTERNAL,
    ADMIN_COOKIE_SECURE: '0',
    DATA_ENCRYPTION_KEY: ENC_KEY,
    PROVIDERS: 'apify',
    APIFY_TOKEN: '',
  });
  // loadConfig with empty API_KEYS — parseApiKeys returns []
  assert.equal(config.apiKeys.length, 0);
  const server = createApp(config, undefined, {
    hubOptions: { getEncryptionKey: () => ENC_KEY },
  });
  server.getHub();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const setup = await json(base, 'POST', '/api/v1/admin/setup', {
      body: {
        setupToken: BOOT,
        username: 'admin',
        password: 'correct-horse-battery',
        confirmPassword: 'correct-horse-battery',
      },
      headers: { origin: ORIGIN, 'x-admin-internal-secret': INTERNAL },
    });
    assert.equal(setup.status, 201);

    const noKey = await fetch(`${base}/api/v1/facebook/posts?page=cern`);
    assert.equal(noKey.status, 401);

    const created = await json(base, 'POST', '/api/v1/admin/api-keys', {
      body: { clientName: 'first', scopes: { facebook: ['cern'] } },
      headers: {
        origin: ORIGIN,
        'x-admin-session': setup.body.data.sessionToken,
        'x-csrf-token': setup.body.data.csrfToken,
      },
    });
    assert.equal(created.status, 201);
    // Without upstream may 502, but auth must pass (not 401)
    const withKey = await fetch(`${base}/api/v1/facebook/posts?page=cern`, {
      headers: { 'x-api-key': created.body.data.key },
    });
    assert.notEqual(withKey.status, 401);
    assert.notEqual(withKey.status, 403);
  } finally {
    server.closeAuth?.();
    server.close();
  }
});
