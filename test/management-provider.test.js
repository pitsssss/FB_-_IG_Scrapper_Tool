import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { loadConfig } from '../src/config.js';
import { createApp } from '../src/server.js';
import { encryptSecret, decryptSecret, parseDataEncryptionKey } from '../src/management/cryptoBox.js';
import { createCredentialRuntime } from '../src/management/credentialRuntime.js';

const ORIGIN = 'http://127.0.0.1:3100';
const BOOT = 'bootstrap-provider-test-token-32ch!';
const INTERNAL = 'internal-bff-secret-for-provider-tests';
const ENC_KEY = randomBytes(32).toString('base64');

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mgmt-prov-'));
}

async function json(base, method, pathname, { body, headers = {} } = {}) {
  const res = await fetch(`${base}${pathname}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json(), res };
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

async function start({ envToken = '', verifyImpl } = {}) {
  const managementDir = tmp();
  const cacheDir = tmp();
  fs.writeFileSync(path.join(cacheDir, 'keep-cache.json'), '{"ok":true}');
  fs.writeFileSync(path.join(cacheDir, 'apify-quota.json'), JSON.stringify({
    schemaVersion: 1, utcDate: '2099-01-01', consumed: 3,
  }));

  let mock;
  let mockUrl;
  if (!verifyImpl) {
    mock = http.createServer((req, res) => {
      const auth = req.headers.authorization || '';
      if (auth === 'Bearer good-token-value-xx') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: { username: 'demo_user' } }));
      } else {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { type: 'invalid-token' } }));
      }
    });
    await new Promise((r) => mock.listen(0, '127.0.0.1', r));
    mockUrl = `http://127.0.0.1:${mock.address().port}`;
  }

  const config = loadConfig({
    API_KEYS: 'testsite:secret123',
    APIFY_TOKEN: envToken,
    APIFY_BASE_URL: 'https://api.apify.com',
    CACHE_DIR: cacheDir,
    MANAGEMENT_DIR: managementDir,
    BOOTSTRAP_SETUP_TOKEN: BOOT,
    ADMIN_ALLOWED_ORIGINS: ORIGIN,
    ADMIN_INTERNAL_SECRET: INTERNAL,
    ADMIN_COOKIE_SECURE: '0',
    DATA_ENCRYPTION_KEY: ENC_KEY,
    PROVIDERS: 'apify',
  });
  config.apifyVerifyBaseUrl = mockUrl;
  config.apifyVerifyAllowCustomBase = true;
  if (verifyImpl) config.apifyVerifyFetch = verifyImpl;

  const server = createApp(config, undefined, {
    hubOptions: {
      verifyOpts: {
        baseUrl: mockUrl,
        allowCustomBase: true,
        timeoutMs: 5000,
      },
      getEncryptionKey: () => ENC_KEY,
    },
  });
  server.getHub();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  // bootstrap admin
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
  const session = setup.body.data.sessionToken;
  const csrf = setup.body.data.csrfToken;

  return {
    server, base, cacheDir, managementDir, mock, session, csrf,
    authHeaders: {
      origin: ORIGIN,
      'x-admin-session': session,
      'x-csrf-token': csrf,
      'x-admin-internal-secret': INTERNAL,
    },
  };
}

test('crypto box: unique nonce, decrypt, tamper reject, wrong key', () => {
  const key = parseDataEncryptionKey(ENC_KEY);
  const a = encryptSecret('same-secret', key);
  const b = encryptSecret('same-secret', key);
  assert.notEqual(a.nonce.toString('hex'), b.nonce.toString('hex'));
  assert.notEqual(a.ciphertext.toString('hex'), b.ciphertext.toString('hex'));
  assert.equal(decryptSecret(a, key), 'same-secret');
  const tampered = { ...a, ciphertext: Buffer.from(a.ciphertext) };
  tampered.ciphertext[0] ^= 0xff;
  assert.throws(() => decryptSecret(tampered, key));
  const other = parseDataEncryptionKey(randomBytes(32).toString('base64'));
  assert.throws(() => decryptSecret(a, other));
});

test('runtime precedence: managed > env; disconnect blocks env', () => {
  const rt = createCredentialRuntime({ envToken: 'env-token' });
  assert.equal(rt.getApifyToken(), 'env-token');
  assert.equal(rt.getStatus().source, 'environment');
  rt.setActiveToken('managed-token', { usernameHint: 'u' });
  assert.equal(rt.getApifyToken(), 'managed-token');
  assert.equal(rt.getStatus().source, 'managed');
  rt.setDisconnected();
  assert.equal(rt.getApifyToken(), '');
  assert.equal(rt.getStatus().source, 'disconnected');
  assert.equal(rt.getStatus().envFallbackSuppressed, true);
});

test('provider connect/validate/disconnect; token never returned; cache untouched', async () => {
  const ctx = await start();
  try {
    const bad = await json(ctx.base, 'POST', '/api/v1/admin/provider/connect', {
      body: { token: 'bad-token' },
      headers: ctx.authHeaders,
    });
    assert.equal(bad.status, 400);

    const ok = await json(ctx.base, 'POST', '/api/v1/admin/provider/connect', {
      body: { token: 'good-token-value-xx' },
      headers: ctx.authHeaders,
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.connected, true);
    assert.equal(ok.body.data.source, 'managed');
    assert.equal(ok.body.data.usernameHint, 'demo_user');
    assert.equal(JSON.stringify(ok.body).includes('good-token'), false);

    const status = await json(ctx.base, 'GET', '/api/v1/admin/provider', {
      headers: { 'x-admin-session': ctx.session },
    });
    assert.equal(status.body.data.connected, true);
    assert.equal(JSON.stringify(status.body).includes('good-token'), false);

    // ciphertext in DB, no plaintext
    const dbFile = path.join(ctx.managementDir, 'app.sqlite');
    const raw = fs.readFileSync(dbFile);
    assert.equal(raw.includes('good-token-value-xx'), false);

    assert.equal(fs.readFileSync(path.join(ctx.cacheDir, 'keep-cache.json'), 'utf8'), '{"ok":true}');
    const quota = JSON.parse(fs.readFileSync(path.join(ctx.cacheDir, 'apify-quota.json'), 'utf8'));
    assert.equal(quota.consumed, 3);

    const disc = await json(ctx.base, 'POST', '/api/v1/admin/provider/disconnect', {
      headers: ctx.authHeaders,
    });
    assert.equal(disc.status, 200);
    assert.equal(disc.body.data.source, 'disconnected');
    assert.equal(disc.body.data.connected, false);
  } finally {
    ctx.server.closeAuth?.();
    ctx.server.close();
    ctx.mock?.close();
  }
});

test('disconnect does not reactivate environment token', async () => {
  const ctx = await start({ envToken: 'env-only-token-xxxx' });
  try {
    await json(ctx.base, 'POST', '/api/v1/admin/provider/connect', {
      body: { token: 'good-token-value-xx' },
      headers: ctx.authHeaders,
    });
    await json(ctx.base, 'POST', '/api/v1/admin/provider/disconnect', {
      headers: ctx.authHeaders,
    });
    const status = await json(ctx.base, 'GET', '/api/v1/admin/provider', {
      headers: { 'x-admin-session': ctx.session },
    });
    assert.equal(status.body.data.source, 'disconnected');
    assert.equal(status.body.data.connected, false);
    assert.equal(status.body.data.envTokenConfigured, true);
    assert.equal(status.body.data.envFallbackSuppressed, true);
  } finally {
    ctx.server.closeAuth?.();
    ctx.server.close();
    ctx.mock?.close();
  }
});

test('missing encryption key fails closed on connect', async () => {
  const managementDir = tmp();
  const mock = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ data: { username: 'x' } }));
  });
  await new Promise((r) => mock.listen(0, '127.0.0.1', r));
  const mockUrl = `http://127.0.0.1:${mock.address().port}`;
  const config = loadConfig({
    API_KEYS: 'testsite:secret123',
    CACHE_DIR: tmp(),
    MANAGEMENT_DIR: managementDir,
    BOOTSTRAP_SETUP_TOKEN: BOOT,
    ADMIN_ALLOWED_ORIGINS: ORIGIN,
    ADMIN_INTERNAL_SECRET: INTERNAL,
    ADMIN_COOKIE_SECURE: '0',
    DATA_ENCRYPTION_KEY: '',
  });
  const server = createApp(config, undefined, {
    hubOptions: {
      verifyOpts: { baseUrl: mockUrl, allowCustomBase: true },
      getEncryptionKey: () => '',
    },
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
    const connect = await json(base, 'POST', '/api/v1/admin/provider/connect', {
      body: { token: 'good-token-value-xx' },
      headers: {
        origin: ORIGIN,
        'x-admin-session': setup.body.data.sessionToken,
        'x-csrf-token': setup.body.data.csrfToken,
      },
    });
    assert.equal(connect.status, 503);
    assert.equal(connect.body.error.code, 'ENCRYPTION_KEY_MISSING');
  } finally {
    server.closeAuth?.();
    server.close();
    mock.close();
  }
});
