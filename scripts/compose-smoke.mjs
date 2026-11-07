#!/usr/bin/env node
/**
 * Isolated full-stack Compose smoke (api + dashboard + caddy).
 * Synthetic secrets only. Unique project name. Cleans up its own resources.
 *
 * Usage (PowerShell / bash):
 *   node scripts/compose-smoke.mjs
 *
 * Requires Docker Engine + Compose. No real Apify. No operator volumes.
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const project = `smp-smoke-${crypto.randomBytes(4).toString('hex')}`;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'smp-compose-smoke-'));
const envFile = path.join(work, '.env');
const bootstrap = crypto.randomBytes(24).toString('base64url');
const internal = crypto.randomBytes(24).toString('base64url');
const encKey = crypto.randomBytes(32).toString('base64');
const apiKey = `smoke${crypto.randomBytes(12).toString('hex')}`;
const hostPort = String(18080 + (crypto.randomBytes(1)[0] % 40));
const base = `http://127.0.0.1:${hostPort}`;

const envText = `
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
API_KEYS=smoke:${apiKey}
APIFY_TOKEN=
PROVIDERS=apify
APIFY_DAILY_RUN_LIMIT=0
CACHE_DIR=/data/cache
MANAGEMENT_DIR=/data/management
BOOTSTRAP_SETUP_TOKEN=${bootstrap}
ADMIN_INTERNAL_SECRET=${internal}
DATA_ENCRYPTION_KEY=${encKey}
ADMIN_ALLOWED_ORIGINS=${base}
ADMIN_COOKIE_SECURE=0
TRUST_PROXY=1
API_DOMAIN=localhost
ALLOWED_PAGES=cern
INSTAGRAM_ALLOWED_PROFILES=nasa
MAX_POSTS=10
UPSTREAM_RETRIES=0
WARM_PAGES=
`.trim();

// Absolute env path so api env_file does not load the operator's repo .env
const envFilePosix = envFile.replace(/\\/g, '/');
fs.writeFileSync(
  envFile,
  `${envText}\nCOMPOSE_ENV_FILE=${envFilePosix}\n`,
);

const composeFiles = [
  '-f', path.join(root, 'docker-compose.yml'),
  '-f', path.join(root, 'docker-compose.local.yml'),
  '-f', path.join(work, 'ports.override.yml'),
];

// Pin secrets on both services so BFF ↔ API always share ADMIN_INTERNAL_SECRET
// (Compose interpolation + env_file alone has been flaky across Desktop builds).
fs.writeFileSync(path.join(work, 'ports.override.yml'), `
services:
  api:
    environment:
      BOOTSTRAP_SETUP_TOKEN: ${JSON.stringify(bootstrap)}
      ADMIN_INTERNAL_SECRET: ${JSON.stringify(internal)}
      DATA_ENCRYPTION_KEY: ${JSON.stringify(encKey)}
      ADMIN_ALLOWED_ORIGINS: ${JSON.stringify(base)}
      ADMIN_COOKIE_SECURE: "0"
      TRUST_PROXY: "1"
      APIFY_DAILY_RUN_LIMIT: "0"
      API_KEYS: smoke:${apiKey}
  dashboard:
    environment:
      ADMIN_INTERNAL_SECRET: ${JSON.stringify(internal)}
      ADMIN_ALLOWED_ORIGINS: ${JSON.stringify(base)}
      ADMIN_COOKIE_SECURE: "0"
  caddy:
    ports: !override
      - "127.0.0.1:${hostPort}:80"
`);

function run(cmd, args, opts = {}) {
  const { allowFail, stdio, env: extraEnv, ...rest } = opts;
  const r = spawnSync(cmd, args, {
    cwd: root,
    encoding: stdio === 'inherit' ? undefined : 'utf8',
    shell: false,
    stdio: stdio || 'pipe',
    env: {
      ...process.env,
      COMPOSE_ENV_FILE: envFilePosix,
      ...(extraEnv || {}),
    },
    ...rest,
  });
  if (r.status !== 0 && !allowFail) {
    if (stdio !== 'inherit') {
      console.error(r.stdout || '');
      console.error(r.stderr || '');
    }
    throw new Error(`${cmd} ${args.join(' ')} failed (${r.status})`);
  }
  return r;
}

function compose(args, opts) {
  return run('docker', ['compose', '-p', project, ...composeFiles, '--env-file', envFile, ...args], opts);
}

function httpReq(method, urlPath, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, base);
    const req = http.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers: { 'content-type': 'application/json', ...headers },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let json;
          try { json = JSON.parse(text); } catch { json = text; }
          resolve({ status: res.statusCode, headers: res.headers, body: json, text });
        });
      },
    );
    req.on('error', reject);
    if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

async function waitHealthy(timeoutMs = 180_000) {
  const start = Date.now();
  let lastErr = '';
  while (Date.now() - start < timeoutMs) {
    try {
      const h = await httpReq('GET', '/health');
      const d = await httpReq('GET', '/api/health');
      if (h.status === 200 && d.status === 200) return;
      lastErr = `health=${h.status} dash=${d.status}`;
    } catch (e) {
      lastErr = e?.message || String(e);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  console.error('waitHealthy last error:', lastErr, 'base=', base);
  compose(['ps'], { allowFail: true, stdio: 'inherit' });
  compose(['port', 'caddy', '80'], { allowFail: true, stdio: 'inherit' });
  compose(['logs', '--no-color', '--tail', '80'], { allowFail: true, stdio: 'inherit' });
  throw new Error(`services never became healthy via Caddy (${lastErr})`);
}

let failed = false;
try {
  console.log(`== compose smoke project=${project} port=${hostPort} work=${work} ==`);
  console.log('== docker compose config ==');
  compose(['config', '-q']);

  console.log('== docker compose build ==');
  compose(['build'], { stdio: 'inherit' });

  console.log('== docker compose up -d ==');
  compose(['up', '-d'], { stdio: 'inherit' });

  console.log('== wait healthy ==');
  await waitHealthy();

  console.log('== public health + posts auth ==');
  const health = await httpReq('GET', '/health');
  if (health.status !== 200 || health.body?.status !== 'ok') throw new Error('health failed');
  const unauth = await httpReq('GET', '/api/v1/facebook/posts?page=cern&limit=1');
  if (unauth.status !== 401) throw new Error(`expected 401 got ${unauth.status}`);

  console.log('== dashboard shell reachable ==');
  const loginPage = await httpReq('GET', '/login');
  if (loginPage.status !== 200) throw new Error(`/login status ${loginPage.status}`);

  console.log('== routing: /api/auth vs /api/v1 ==');
  const authMeUnauth = await httpReq('GET', '/api/auth/me');
  if (authMeUnauth.status === 404) throw new Error('/api/auth/me 404 — BFF not routed to dashboard');
  const v1miss = await httpReq('GET', '/api/v1/facebook/posts?page=cern');
  if (v1miss.status !== 401) throw new Error(`v1 missing key expected 401 got ${v1miss.status}`);
  // Admin Node routes must not be publicly useful without session (and not confused with BFF)
  const adminDirect = await httpReq('GET', '/api/v1/admin/settings');
  if (adminDirect.status === 200) throw new Error('admin settings returned 200 without session');

  console.log('== admin setup through Caddy BFF ==');
  const setup = await httpReq('POST', '/api/auth/setup', {
    headers: { origin: base },
    body: {
      setupToken: bootstrap,
      email: 'compose-smoke@example.com',
      password: 'ComposeSmokePass1!',
      confirmPassword: 'ComposeSmokePass1!',
    },
  });
  if (setup.status !== 201 && setup.status !== 200) {
    throw new Error(`setup failed ${setup.status}: ${String(setup.text).slice(0, 300)}`);
  }
  const setCookie = setup.headers['set-cookie'];
  const cookieHeader = Array.isArray(setCookie) ? setCookie.map((c) => c.split(';')[0]).join('; ') : '';
  if (!cookieHeader.includes('smp_admin_session')) {
    throw new Error('setup did not Set-Cookie smp_admin_session');
  }
  const csrf = setup.body?.data?.csrfToken;
  if (!csrf) throw new Error('setup missing csrfToken');

  const me = await httpReq('GET', '/api/auth/me', {
    headers: { cookie: cookieHeader, origin: base },
  });
  if (me.status !== 200 || me.body?.success !== true) {
    throw new Error(`authenticated /api/auth/me failed ${me.status}`);
  }

  const settings = await httpReq('GET', '/api/management/settings', {
    headers: { cookie: cookieHeader, origin: base },
  });
  if (settings.status !== 200 || settings.body?.success !== true) {
    throw new Error(`settings via BFF failed ${settings.status}`);
  }

  // Second setup must fail
  const setup2 = await httpReq('POST', '/api/auth/setup', {
    headers: { origin: base },
    body: {
      setupToken: bootstrap,
      email: 'other@example.com',
      password: 'ComposeSmokePass1!',
      confirmPassword: 'ComposeSmokePass1!',
    },
  });
  if (setup2.status === 200 || setup2.status === 201) {
    throw new Error('second setup unexpectedly succeeded');
  }

  console.log('== logout ==');
  const logout = await httpReq('POST', '/api/auth/logout', {
    headers: {
      cookie: cookieHeader,
      origin: base,
      'x-csrf-token': csrf,
    },
    body: {},
  });
  if (![200, 204].includes(logout.status)) {
    throw new Error(`logout failed ${logout.status}`);
  }

  // Secret scan in responses
  const blob = JSON.stringify(health) + JSON.stringify(me) + JSON.stringify(settings) + JSON.stringify(v1miss);
  for (const secret of [bootstrap, internal, encKey, apiKey]) {
    if (blob.includes(secret)) throw new Error('secret leaked in HTTP response');
  }

  console.log('== restart api persistence volume ==');
  compose(['restart', 'api'], { stdio: 'inherit' });
  await waitHealthy(120_000);
  const health2 = await httpReq('GET', '/health');
  if (health2.status !== 200) throw new Error('health after restart failed');

  // Management DB must still reject a second setup after volume-backed restart
  const setupAfterRestart = await httpReq('POST', '/api/auth/setup', {
    headers: { origin: base },
    body: {
      setupToken: bootstrap,
      email: 'after-restart@example.com',
      password: 'ComposeSmokePass1!',
      confirmPassword: 'ComposeSmokePass1!',
    },
  });
  if (setupAfterRestart.status === 200 || setupAfterRestart.status === 201) {
    throw new Error('setup succeeded again after restart — management volume not durable');
  }

  const login = await httpReq('POST', '/api/auth/login', {
    headers: { origin: base },
    body: { email: 'compose-smoke@example.com', password: 'ComposeSmokePass1!' },
  });
  if (login.status !== 200 || login.body?.success !== true) {
    throw new Error(`login after restart failed ${login.status}`);
  }

  console.log('COMPOSE_SMOKE: PASS');
} catch (err) {
  failed = true;
  console.error('COMPOSE_SMOKE: FAIL', err?.message || err);
  compose(['logs', '--no-color', '--tail', '120'], { allowFail: true, stdio: 'inherit' });
} finally {
  console.log('== cleanup project resources ==');
  compose(['down', '-v', '--remove-orphans'], { allowFail: true, stdio: 'inherit' });
  try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* ignore */ }
}

process.exit(failed ? 1 : 0);
