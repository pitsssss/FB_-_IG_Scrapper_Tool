#!/usr/bin/env node
/**
 * Release-candidate acceptance against an isolated Compose stack.
 * Extends compose-smoke with API-key auth through Caddy, CSRF rejection,
 * and management settings read. Synthetic credentials only.
 *
 * Usage: node scripts/release-acceptance.mjs
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const project = `smp-rc-${crypto.randomBytes(4).toString('hex')}`;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'smp-rc-'));
const envFile = path.join(work, '.env');
const bootstrap = crypto.randomBytes(24).toString('base64url');
const internal = crypto.randomBytes(24).toString('base64url');
const encKey = crypto.randomBytes(32).toString('base64');
const apiKey = `rc${crypto.randomBytes(12).toString('hex')}`;
const hostPort = String(18120 + (crypto.randomBytes(1)[0] % 30));
const base = `http://127.0.0.1:${hostPort}`;
const envFilePosix = envFile.replace(/\\/g, '/');

const envText = `
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
API_KEYS=rc:${apiKey}
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
COMPOSE_ENV_FILE=${envFilePosix}
`.trim();

fs.writeFileSync(envFile, `${envText}\n`);
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
      API_KEYS: rc:${apiKey}
  dashboard:
    environment:
      ADMIN_INTERNAL_SECRET: ${JSON.stringify(internal)}
      ADMIN_ALLOWED_ORIGINS: ${JSON.stringify(base)}
      ADMIN_COOKIE_SECURE: "0"
  caddy:
    ports: !override
      - "127.0.0.1:${hostPort}:80"
`);

const composeFiles = [
  '-f', path.join(root, 'docker-compose.yml'),
  '-f', path.join(root, 'docker-compose.local.yml'),
  '-f', path.join(work, 'ports.override.yml'),
];

function run(cmd, args, opts = {}) {
  const { allowFail, stdio, ...rest } = opts;
  const r = spawnSync(cmd, args, {
    cwd: root,
    encoding: stdio === 'inherit' ? undefined : 'utf8',
    shell: false,
    stdio: stdio || 'pipe',
    env: { ...process.env, COMPOSE_ENV_FILE: envFilePosix },
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
  while (Date.now() - start < timeoutMs) {
    try {
      const h = await httpReq('GET', '/health');
      const d = await httpReq('GET', '/api/health');
      if (h.status === 200 && d.status === 200) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('services never became healthy via Caddy');
}

function cookieJar(setCookie) {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  return list.map((c) => c.split(';')[0]).join('; ');
}

let failed = false;
try {
  console.log(`== release acceptance project=${project} port=${hostPort} ==`);
  compose(['config', '-q']);
  compose(['up', '-d', '--build'], { stdio: 'inherit' });
  await waitHealthy();

  const health = await httpReq('GET', '/health');
  if (health.status !== 200) throw new Error('health failed');

  const postsUnauth = await httpReq('GET', '/api/v1/facebook/posts?page=cern&limit=1');
  if (postsUnauth.status !== 401) throw new Error(`expected 401 got ${postsUnauth.status}`);

  // Valid env key still authorized through Caddy (cache-miss with quota 0 → 502/503 — not 401)
  const postsAuth = await httpReq('GET', '/api/v1/facebook/posts?page=cern&limit=1', {
    headers: { 'x-api-key': apiKey },
  });
  if (postsAuth.status === 401 || postsAuth.status === 403) {
    throw new Error(`valid API key rejected (${postsAuth.status})`);
  }
  if (![200, 502, 503].includes(postsAuth.status)) {
    throw new Error(`unexpected posts status ${postsAuth.status}: ${String(postsAuth.text).slice(0, 200)}`);
  }

  const evilOrigin = await httpReq('POST', '/api/auth/setup', {
    headers: { origin: 'https://evil.example' },
    body: {
      setupToken: bootstrap,
      email: 'evil@example.com',
      password: 'ReleaseAccept1!',
      confirmPassword: 'ReleaseAccept1!',
    },
  });
  if (evilOrigin.status === 200 || evilOrigin.status === 201) {
    throw new Error('cross-origin setup must be rejected by BFF Origin gate');
  }
  if (evilOrigin.status !== 403) {
    throw new Error(`expected evil origin 403 got ${evilOrigin.status}`);
  }
  for (const secret of [bootstrap, internal, encKey, apiKey]) {
    if (String(evilOrigin.text).includes(secret)) throw new Error('secret leaked');
  }

  const setup = await httpReq('POST', '/api/auth/setup', {
    headers: { origin: base },
    body: {
      setupToken: 'wrong-token-value-xxxxxx',
      email: 'rc@example.com',
      password: 'ReleaseAccept1!',
      confirmPassword: 'ReleaseAccept1!',
    },
  });
  if (setup.status === 200 || setup.status === 201) throw new Error('bad bootstrap token accepted');

  const setupOk = await httpReq('POST', '/api/auth/setup', {
    headers: { origin: base },
    body: {
      setupToken: bootstrap,
      email: 'rc@example.com',
      password: 'ReleaseAccept1!',
      confirmPassword: 'ReleaseAccept1!',
    },
  });
  if (setupOk.status !== 201 && setupOk.status !== 200) {
    throw new Error(`setup failed ${setupOk.status}: ${String(setupOk.text).slice(0, 300)}`);
  }
  const cookies = cookieJar(setupOk.headers['set-cookie']);
  const csrf = setupOk.body?.data?.csrfToken;
  if (!cookies.includes('smp_admin_session') || !csrf) throw new Error('missing session/csrf');

  const me = await httpReq('GET', '/api/auth/me', { headers: { cookie: cookies, origin: base } });
  if (me.status !== 200) throw new Error('me failed');

  const badCsrf = await httpReq('POST', '/api/auth/logout', {
    headers: { cookie: cookies, origin: base, 'x-csrf-token': 'invalid' },
    body: {},
  });
  if (badCsrf.status === 200 || badCsrf.status === 204) {
    // Some paths may still clear cookies; require non-success body if 200
    if (badCsrf.body?.success === true) throw new Error('invalid CSRF accepted');
  }

  const settings = await httpReq('GET', '/api/management/settings', {
    headers: { cookie: cookies, origin: base },
  });
  if (settings.status !== 200 || settings.body?.success !== true) {
    throw new Error(`settings failed ${settings.status}`);
  }

  const logout = await httpReq('POST', '/api/auth/logout', {
    headers: { cookie: cookies, origin: base, 'x-csrf-token': csrf },
    body: {},
  });
  if (![200, 204].includes(logout.status)) throw new Error(`logout ${logout.status}`);

  const me2 = await httpReq('GET', '/api/auth/me', { headers: { cookie: cookies, origin: base } });
  if (me2.status === 200 && me2.body?.success === true) {
    throw new Error('session still valid after logout');
  }

  const login = await httpReq('POST', '/api/auth/login', {
    headers: { origin: base },
    body: { email: 'rc@example.com', password: 'ReleaseAccept1!' },
  });
  if (login.status !== 200) throw new Error(`re-login failed ${login.status}`);

  const overview = await httpReq('GET', '/overview');
  if (overview.status !== 200 && overview.status !== 307 && overview.status !== 302) {
    throw new Error(`overview unexpected ${overview.status}`);
  }

  console.log('RELEASE_ACCEPTANCE: PASS');
} catch (err) {
  failed = true;
  console.error('RELEASE_ACCEPTANCE: FAIL', err?.message || err);
  compose(['logs', '--no-color', '--tail', '80'], { allowFail: true, stdio: 'inherit' });
} finally {
  compose(['down', '-v', '--remove-orphans'], { allowFail: true, stdio: 'inherit' });
  try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* ignore */ }
}

process.exit(failed ? 1 : 0);
