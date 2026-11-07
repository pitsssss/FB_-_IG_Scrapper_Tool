import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/server.js';
import { createAuthService } from '../src/management/authService.js';
import { SESSION_COOKIE, CSRF_COOKIE } from '../src/management/sessions.js';
import { sha256Hex } from '../src/management/cryptoUtil.js';

const ORIGIN = 'http://127.0.0.1:3100';
const TOKEN = 'bootstrap-admin-auth-token-32ch!!';
const INTERNAL = 'internal-bff-secret-for-tests-32';

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'admin-auth-'));
}

async function startApp(extra = {}) {
  const managementDir = tmp();
  const cacheDir = tmp();
  const config = loadConfig({
    API_KEYS: 'testsite:secret123',
    PROVIDERS: 'apify',
    APIFY_TOKEN: '',
    CACHE_DIR: cacheDir,
    MANAGEMENT_DIR: managementDir,
    BOOTSTRAP_SETUP_TOKEN: TOKEN,
    ADMIN_ALLOWED_ORIGINS: ORIGIN,
    ADMIN_INTERNAL_SECRET: INTERNAL,
    ADMIN_COOKIE_SECURE: '0',
    UPSTREAM_RETRIES: '0',
    ...extra,
  });
  const auth = createAuthService({
    managementDir,
    getSetupToken: () => config.bootstrapSetupToken,
    allowedOrigins: config.adminAllowedOrigins.join(','),
    trustProxy: false,
    internalSecret: config.adminInternalSecret,
    setupRateMax: 50,
    loginIpRateMax: 50,
    loginUserRateMax: 50,
  });
  const server = createApp(config, undefined, { authService: auth });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base, auth, managementDir, cacheDir, config };
}

async function json(base, method, pathname, { body, headers = {} } = {}) {
  const res = await fetch(`${base}${pathname}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: res.status, body: parsed, headers: res.headers, res };
}

function parseCookies(res) {
  const raw = res.headers.getSetCookie?.() || [];
  const map = {};
  for (const c of raw) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    if (i > 0) map[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1));
  }
  return map;
}

test('setup status fails closed guidance without completed admin', async () => {
  const { server, base, auth } = await startApp({ BOOTSTRAP_SETUP_TOKEN: '' });
  try {
    auth.bootstrap; // ensure
    // Recreate with empty token by checking status endpoint — override via new app
  } finally {
    auth.close();
    server.close();
  }

  const managementDir = tmp();
  const config = loadConfig({
    API_KEYS: 'testsite:secret123',
    CACHE_DIR: tmp(),
    MANAGEMENT_DIR: managementDir,
    BOOTSTRAP_SETUP_TOKEN: '',
    ADMIN_ALLOWED_ORIGINS: ORIGIN,
    ADMIN_COOKIE_SECURE: '0',
  });
  const a = createAuthService({
    managementDir,
    getSetupToken: () => '',
    allowedOrigins: ORIGIN,
  });
  const s = createApp(config, undefined, { authService: a });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const b = `http://127.0.0.1:${s.address().port}`;
  try {
    const st = await json(b, 'GET', '/api/v1/admin/setup/status');
    assert.equal(st.status, 200);
    assert.equal(st.body.data.status, 'needs_token');
    assert.equal(st.body.data.setupAvailable, false);
  } finally {
    a.close();
    s.close();
  }
});

test('bootstrap: wrong token denied; correct creates admin; reuse denied', async () => {
  const { server, base, auth } = await startApp();
  try {
    const bad = await json(base, 'POST', '/api/v1/admin/setup', {
      body: {
        setupToken: 'wrong-token-wrong-token-xx',
        email: 'admin@example.com',
        username: 'admin',
        password: 'correct-horse-battery',
        confirmPassword: 'correct-horse-battery',
      },
      headers: { origin: ORIGIN },
    });
    assert.equal(bad.status, 403);

    const ok = await json(base, 'POST', '/api/v1/admin/setup', {
      body: {
        setupToken: TOKEN,
        email: 'admin@example.com',
        username: 'admin',
        password: 'correct-horse-battery',
        confirmPassword: 'correct-horse-battery',
      },
      headers: { origin: ORIGIN },
    });
    assert.equal(ok.status, 201);
    assert.equal(ok.body.success, true);
    assert.equal(ok.body.data.admin.username, 'admin');
    assert.equal(ok.body.data.sessionToken, undefined);
    assert.ok(ok.body.data.csrfToken);
    const cookies = parseCookies(ok.res);
    assert.ok(cookies[SESSION_COOKIE]);
    assert.ok(cookies[CSRF_COOKIE]);

    const reuse = await json(base, 'POST', '/api/v1/admin/setup', {
      body: {
        setupToken: TOKEN,
        email: 'other@example.com',
        username: 'other',
        password: 'correct-horse-battery',
        confirmPassword: 'correct-horse-battery',
      },
      headers: { origin: ORIGIN },
    });
    assert.equal(reuse.status, 409);

    // Password never in response
    assert.equal(JSON.stringify(ok.body).includes('correct-horse'), false);
    assert.equal(JSON.stringify(ok.body).includes(TOKEN), false);
  } finally {
    auth.close();
    server.close();
  }
});

test('login, me, logout, forged session, csrf', async () => {
  const { server, base, auth } = await startApp();
  try {
    await json(base, 'POST', '/api/v1/admin/setup', {
      body: {
        setupToken: TOKEN,
        email: 'admin@example.com',
        username: 'admin',
        password: 'correct-horse-battery',
        confirmPassword: 'correct-horse-battery',
      },
      headers: { origin: ORIGIN },
    });

    const missingOrigin = await json(base, 'POST', '/api/v1/admin/login', {
      body: { username: 'admin', password: 'correct-horse-battery' },
    });
    assert.equal(missingOrigin.status, 403);

    const cross = await json(base, 'POST', '/api/v1/admin/login', {
      body: { username: 'admin', password: 'correct-horse-battery' },
      headers: { origin: 'https://evil.example' },
    });
    assert.equal(cross.status, 403);

    const login = await json(base, 'POST', '/api/v1/admin/login', {
      body: { username: 'admin', password: 'correct-horse-battery' },
      headers: { origin: ORIGIN },
    });
    assert.equal(login.status, 200);
    const cookies = parseCookies(login.res);
    const session = cookies[SESSION_COOKIE];
    const csrf = cookies[CSRF_COOKIE];

    const me = await json(base, 'GET', '/api/v1/admin/me', {
      headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(session)}` },
    });
    assert.equal(me.status, 200);
    assert.equal(me.body.data.admin.username, 'admin');

    const forged = await json(base, 'GET', '/api/v1/admin/me', {
      headers: { cookie: `${SESSION_COOKIE}=forged-token-value` },
    });
    assert.equal(forged.status, 401);

    const logoutNoCsrf = await json(base, 'POST', '/api/v1/admin/logout', {
      headers: {
        origin: ORIGIN,
        cookie: `${SESSION_COOKIE}=${encodeURIComponent(session)}`,
      },
    });
    assert.equal(logoutNoCsrf.status, 403);

    const logout = await json(base, 'POST', '/api/v1/admin/logout', {
      headers: {
        origin: ORIGIN,
        cookie: `${SESSION_COOKIE}=${encodeURIComponent(session)}; ${CSRF_COOKIE}=${encodeURIComponent(csrf)}`,
        'x-csrf-token': csrf,
      },
    });
    assert.equal(logout.status, 200);

    const meAfter = await json(base, 'GET', '/api/v1/admin/me', {
      headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(session)}` },
    });
    assert.equal(meAfter.status, 401);

    // API key cannot authenticate as admin
    const withApiKey = await json(base, 'GET', '/api/v1/admin/me', {
      headers: { 'x-api-key': 'secret123' },
    });
    assert.equal(withApiKey.status, 401);

    // Admin cookie cannot authorize public posts API
    const relogin = await json(base, 'POST', '/api/v1/admin/login', {
      body: { username: 'admin', password: 'correct-horse-battery' },
      headers: { origin: ORIGIN },
    });
    const c2 = parseCookies(relogin.res);
    const posts = await fetch(`${base}/api/v1/facebook/posts?page=cern`, {
      headers: { cookie: `${SESSION_COOKIE}=${encodeURIComponent(c2[SESSION_COOKIE])}` },
    });
    assert.equal(posts.status, 401);
  } finally {
    auth.close();
    server.close();
  }
});

test('internal BFF secret returns sessionToken; password change revokes old sessions', async () => {
  const { server, base, auth } = await startApp();
  try {
    const setup = await json(base, 'POST', '/api/v1/admin/setup', {
      body: {
        setupToken: TOKEN,
        email: 'admin@example.com',
        username: 'admin',
        password: 'correct-horse-battery',
        confirmPassword: 'correct-horse-battery',
      },
      headers: {
        origin: ORIGIN,
        'x-admin-internal-secret': INTERNAL,
      },
    });
    assert.equal(setup.status, 201);
    assert.ok(setup.body.data.sessionToken);
    const oldSession = setup.body.data.sessionToken;
    const oldCsrf = setup.body.data.csrfToken;

    const changed = await json(base, 'POST', '/api/v1/admin/password', {
      body: {
        currentPassword: 'correct-horse-battery',
        newPassword: 'new-correct-horse-battery',
        confirmPassword: 'new-correct-horse-battery',
      },
      headers: {
        origin: ORIGIN,
        cookie: `${SESSION_COOKIE}=${encodeURIComponent(oldSession)}; ${CSRF_COOKIE}=${encodeURIComponent(oldCsrf)}`,
        'x-csrf-token': oldCsrf,
        'x-admin-internal-secret': INTERNAL,
      },
    });
    assert.equal(changed.status, 200);
    assert.ok(changed.body.data.sessionToken);

    const oldMe = await json(base, 'GET', '/api/v1/admin/me', {
      headers: { 'x-admin-session': oldSession },
    });
    assert.equal(oldMe.status, 401);

    const newMe = await json(base, 'GET', '/api/v1/admin/me', {
      headers: { 'x-admin-session': changed.body.data.sessionToken },
    });
    assert.equal(newMe.status, 200);
  } finally {
    auth.close();
    server.close();
  }
});

test('GET cannot mutate setup; rate limit on setup', async () => {
  const { server, base, auth } = await startApp({
    // tighten via recreating limiter — use many attempts against wrong token
  });
  try {
    const getMut = await json(base, 'GET', '/api/v1/admin/setup');
    assert.ok([404, 405].includes(getMut.status));

    const tightDir = tmp();
    const config = loadConfig({
      API_KEYS: 'testsite:secret123',
      CACHE_DIR: tmp(),
      MANAGEMENT_DIR: tightDir,
      BOOTSTRAP_SETUP_TOKEN: TOKEN,
      ADMIN_ALLOWED_ORIGINS: ORIGIN,
      ADMIN_COOKIE_SECURE: '0',
    });
    const a = createAuthService({
      managementDir: tightDir,
      getSetupToken: () => TOKEN,
      allowedOrigins: ORIGIN,
      setupRateMax: 3,
    });
    const s = createApp(config, undefined, { authService: a });
    await new Promise((r) => s.listen(0, '127.0.0.1', r));
    const b = `http://127.0.0.1:${s.address().port}`;
    try {
      let last;
      for (let i = 0; i < 4; i += 1) {
        last = await json(b, 'POST', '/api/v1/admin/setup', {
          body: {
            setupToken: 'wrong-token-wrong-token-xx',
            email: 'admin@example.com',
            username: 'admin',
            password: 'correct-horse-battery',
            confirmPassword: 'correct-horse-battery',
          },
          headers: { origin: ORIGIN },
        });
      }
      assert.equal(last.status, 429);
    } finally {
      a.close();
      s.close();
    }
  } finally {
    auth.close();
    server.close();
  }
});

test('session idle/absolute expiry', async () => {
  const { server, base, auth } = await startApp();
  try {
    const setup = await json(base, 'POST', '/api/v1/admin/setup', {
      body: {
        setupToken: TOKEN,
        email: 'admin@example.com',
        username: 'admin',
        password: 'correct-horse-battery',
        confirmPassword: 'correct-horse-battery',
      },
      headers: { origin: ORIGIN, 'x-admin-internal-secret': INTERNAL },
    });
    const token = setup.body.data.sessionToken;
    const expired = auth.sessions.validate(token, { nowMs: Date.now() + 13 * 60 * 60 * 1000, touchIdle: false });
    assert.equal(expired.ok, false);
    assert.ok(['absolute_expired', 'idle_expired'].includes(expired.reason));
  } finally {
    auth.close();
    server.close();
  }
});

test('management dir does not touch cache; recovery CLI path', async () => {
  const { server, base, auth, cacheDir, managementDir } = await startApp();
  try {
    fs.writeFileSync(path.join(cacheDir, 'keep-me.json'), '{"ok":true}');
    await json(base, 'POST', '/api/v1/admin/setup', {
      body: {
        setupToken: TOKEN,
        email: 'admin@example.com',
        username: 'admin',
        password: 'correct-horse-battery',
        confirmPassword: 'correct-horse-battery',
      },
      headers: { origin: ORIGIN },
    });
    assert.equal(fs.readFileSync(path.join(cacheDir, 'keep-me.json'), 'utf8'), '{"ok":true}');
    assert.ok(fs.existsSync(path.join(managementDir, 'app.sqlite')));

    const recovered = await auth.recoverPassword('recovered-password-12');
    assert.equal(recovered.ok, true);

    const loginOld = await json(base, 'POST', '/api/v1/admin/login', {
      body: { username: 'admin', password: 'correct-horse-battery' },
      headers: { origin: ORIGIN },
    });
    assert.equal(loginOld.status, 401);

    const loginNew = await json(base, 'POST', '/api/v1/admin/login', {
      body: { username: 'admin', password: 'recovered-password-12' },
      headers: { origin: ORIGIN },
    });
    assert.equal(loginNew.status, 200);
  } finally {
    auth.close();
    server.close();
  }
});

test('public health still works; secrets not in setup status', async () => {
  const { server, base, auth } = await startApp();
  try {
    const health = await json(base, 'GET', '/health');
    assert.equal(health.status, 200);
    const st = await json(base, 'GET', '/api/v1/admin/setup/status');
    assert.equal(JSON.stringify(st.body).includes(TOKEN), false);
    assert.equal(JSON.stringify(st.body).includes(INTERNAL), false);
    assert.ok(!String(sha256Hex(TOKEN)).includes(' '));
  } finally {
    auth.close();
    server.close();
  }
});
