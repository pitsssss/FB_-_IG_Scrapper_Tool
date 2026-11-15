#!/usr/bin/env node
/**
 * Isolated smoke against *pre-built* release-candidate images via
 * docker-compose.release.yml (image path), not source build.
 *
 * Local-only tags expected (do not push):
 *   ghcr.io/pitsssss/social-media-posts-api:0.1.0-beta.1-rc
 *   ghcr.io/pitsssss/social-media-posts-dashboard:0.1.0-beta.1-rc
 *
 * Uses a unique Compose project, loopback port, synthetic secrets,
 * APIFY_DAILY_RUN_LIMIT=0, empty token. Cleans up its own volumes.
 *
 * Usage: node scripts/release-image-smoke.mjs
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const project = `smp-relimg-${crypto.randomBytes(4).toString('hex')}`;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'smp-relimg-'));
const envFile = path.join(work, '.env');
const bootstrap = crypto.randomBytes(24).toString('base64url');
const internal = crypto.randomBytes(24).toString('base64url');
const encKey = crypto.randomBytes(32).toString('base64');
const apiKey = `rel${crypto.randomBytes(12).toString('hex')}`;
const scopedKey = `scope${crypto.randomBytes(10).toString('hex')}`;
const hostPort = String(18200 + (crypto.randomBytes(1)[0] % 40));
const base = `http://127.0.0.1:${hostPort}`;
const envFilePosix = envFile.replace(/\\/g, '/');

const apiImage = process.env.SMP_API_IMAGE || 'ghcr.io/pitsssss/social-media-posts-api:0.1.0-beta.1-rc';
const dashImage =
  process.env.SMP_DASHBOARD_IMAGE ||
  'ghcr.io/pitsssss/social-media-posts-dashboard:0.1.0-beta.1-rc';

const envText = `
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
API_KEYS=rel:${apiKey},scoped:${scopedKey}
API_KEY_PAGE_SCOPES={"rel":["cern","instagram:nasa"],"scoped":["instagram:nasa"]}
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
ALLOWED_PAGES=
INSTAGRAM_ALLOWED_PROFILES=
MAX_POSTS=10
UPSTREAM_RETRIES=0
WARM_PAGES=
INSTAGRAM_WARM_PROFILES=
INSTAGRAM_PROFILE_ENRICHMENT=0
SMP_API_IMAGE=${apiImage}
SMP_DASHBOARD_IMAGE=${dashImage}
COMPOSE_ENV_FILE=${envFilePosix}
`.trim();

fs.writeFileSync(envFile, `${envText}\n`);

const caddyfileLocal = path.join(root, 'Caddyfile.local').replace(/\\/g, '/');

// Release compose + local Caddyfile + loopback port (production release file binds 80/443).
fs.writeFileSync(
  path.join(work, 'local.override.yml'),
  `
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
      APIFY_TOKEN: ""
      WARM_PAGES: ""
      INSTAGRAM_WARM_PROFILES: ""
      INSTAGRAM_PROFILE_ENRICHMENT: "0"
      API_KEYS: rel:${apiKey},scoped:${scopedKey}
      API_KEY_PAGE_SCOPES: '{"rel":["cern","instagram:nasa"],"scoped":["instagram:nasa"]}'
  dashboard:
    environment:
      ADMIN_INTERNAL_SECRET: ${JSON.stringify(internal)}
      ADMIN_ALLOWED_ORIGINS: ${JSON.stringify(base)}
      ADMIN_COOKIE_SECURE: "0"
  caddy:
    ports: !override
      - "127.0.0.1:${hostPort}:80"
    volumes: !override
      - "${caddyfileLocal}:/etc/caddy/Caddyfile:ro"
      - caddy_data:/data
      - caddy_config:/config
    environment:
      API_DOMAIN: localhost
`,
);

const composeFiles = [
  '-f',
  path.join(root, 'docker-compose.release.yml'),
  '-f',
  path.join(work, 'local.override.yml'),
];

function run(cmd, args, opts = {}) {
  const { allowFail, stdio, ...rest } = opts;
  const r = spawnSync(cmd, args, {
    cwd: root,
    encoding: stdio === 'inherit' ? undefined : 'utf8',
    shell: false,
    stdio: stdio || 'pipe',
    env: {
      ...process.env,
      COMPOSE_ENV_FILE: envFilePosix,
      SMP_API_IMAGE: apiImage,
      SMP_DASHBOARD_IMAGE: dashImage,
      ADMIN_INTERNAL_SECRET: internal,
      ADMIN_ALLOWED_ORIGINS: base,
      ADMIN_COOKIE_SECURE: '0',
      TRUST_PROXY: '1',
      API_DOMAIN: 'localhost',
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
  return run(
    'docker',
    ['compose', '-p', project, ...composeFiles, '--env-file', envFile, ...args],
    opts,
  );
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
          try {
            json = JSON.parse(text);
          } catch {
            json = text;
          }
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
  compose(['ps'], { allowFail: true, stdio: 'inherit' });
  compose(['logs', '--no-color', '--tail', '80'], { allowFail: true, stdio: 'inherit' });
  throw new Error(`services never healthy (${lastErr})`);
}

let failed = false;
try {
  console.log(`== release-image smoke project=${project} port=${hostPort} ==`);
  console.log(`api=${apiImage}`);
  console.log(`dashboard=${dashImage}`);

  for (const img of [apiImage, dashImage]) {
    const insp = run('docker', ['image', 'inspect', img, '--format', '{{.Id}}']);
    if (!insp.stdout?.trim()) throw new Error(`missing local image ${img}`);
  }

  compose(['config', '-q']);
  compose(['up', '-d'], { stdio: 'inherit' });
  await waitHealthy();

  const health = await httpReq('GET', '/health');
  if (health.status !== 200 || health.body?.status !== 'ok') throw new Error('health failed');

  const unauth = await httpReq('GET', '/api/v1/facebook/posts?page=cern&limit=1');
  if (unauth.status !== 401) throw new Error(`expected 401 got ${unauth.status}`);

  const wrongScope = await httpReq('GET', '/api/v1/facebook/posts?page=cern&limit=1', {
    headers: { 'x-api-key': scopedKey },
  });
  if (![403, 401].includes(wrongScope.status)) {
    throw new Error(`wrong-scope expected 403/401 got ${wrongScope.status}`);
  }

  // Cache-only / empty: with limit 0 and no cache, expect structured failure (not crash).
  const emptyCache = await httpReq('GET', '/api/v1/facebook/posts?page=cern&limit=1', {
    headers: { 'x-api-key': apiKey },
  });
  if (emptyCache.status === 200 && emptyCache.body?.success === true) {
    // Unexpected live data on empty install — still OK if synthetic, but flag.
    console.warn('WARN: unexpected 200 with posts on empty cache-only install');
  } else if (![502, 404, 503, 429].includes(emptyCache.status) && emptyCache.status !== 200) {
    // Accept any non-auth error envelope for miss; 502 UPSTREAM is typical.
    if (!emptyCache.body || emptyCache.body.success !== false) {
      throw new Error(`empty-cache unexpected ${emptyCache.status}: ${String(emptyCache.text).slice(0, 200)}`);
    }
  }

  const setupPage = await httpReq('GET', '/setup');
  if (setupPage.status !== 200) throw new Error(`/setup ${setupPage.status}`);

  const setup = await httpReq('POST', '/api/auth/setup', {
    headers: { origin: base },
    body: {
      setupToken: bootstrap,
      email: 'relimg-smoke@example.com',
      password: 'RelImgSmokePass1!',
      confirmPassword: 'RelImgSmokePass1!',
    },
  });
  if (![200, 201].includes(setup.status)) {
    throw new Error(`setup failed ${setup.status}: ${String(setup.text).slice(0, 300)}`);
  }
  const setCookie = setup.headers['set-cookie'];
  const cookieHeader = Array.isArray(setCookie)
    ? setCookie.map((c) => c.split(';')[0]).join('; ')
    : '';
  if (!cookieHeader.includes('smp_admin_session')) throw new Error('missing session cookie');
  const csrf = setup.body?.data?.csrfToken;
  if (!csrf) throw new Error('missing csrf');

  const me = await httpReq('GET', '/api/auth/me', {
    headers: { cookie: cookieHeader, origin: base },
  });
  if (me.status !== 200 || me.body?.success !== true) throw new Error('me failed');

  // Unauthenticated /overview should redirect; authenticated should render.
  const overviewAnon = await httpReq('GET', '/overview');
  if (![307, 302, 303].includes(overviewAnon.status)) {
    throw new Error(`/overview anon expected redirect got ${overviewAnon.status}`);
  }
  const overviewAuth = await httpReq('GET', '/overview', {
    headers: { cookie: cookieHeader },
  });
  if (overviewAuth.status !== 200) {
    throw new Error(`/overview auth expected 200 got ${overviewAuth.status}`);
  }

  // Create managed API key through BFF (shape matches dashboard/API contract)
  const createKey = await httpReq('POST', '/api/management/api-keys', {
    headers: { cookie: cookieHeader, origin: base, 'x-csrf-token': csrf },
    body: {
      clientName: 'relimg-key',
      scopes: { facebook: ['cern'], instagram: ['nasa'] },
    },
  });
  if (![200, 201].includes(createKey.status) || createKey.body?.success !== true) {
    throw new Error(`api-key create failed ${createKey.status}: ${String(createKey.text).slice(0, 300)}`);
  }
  const once =
    createKey.body?.data?.apiKey ||
    createKey.body?.data?.key ||
    createKey.body?.data?.secret ||
    createKey.body?.data?.plaintextKey;
  if (!once || typeof once !== 'string') throw new Error('managed key secret not returned once');

  const logout = await httpReq('POST', '/api/auth/logout', {
    headers: { cookie: cookieHeader, origin: base, 'x-csrf-token': csrf },
    body: {},
  });
  if (![200, 204].includes(logout.status)) throw new Error(`logout ${logout.status}`);

  compose(['restart', 'api'], { stdio: 'inherit' });
  await waitHealthy(120_000);

  const login = await httpReq('POST', '/api/auth/login', {
    headers: { origin: base },
    body: { email: 'relimg-smoke@example.com', password: 'RelImgSmokePass1!' },
  });
  if (login.status !== 200 || login.body?.success !== true) {
    throw new Error(`login after restart failed ${login.status}`);
  }

  // Secret leak scan
  const blob = JSON.stringify(health) + JSON.stringify(me) + JSON.stringify(emptyCache);
  for (const secret of [bootstrap, internal, encKey, apiKey, scopedKey, once]) {
    if (blob.includes(secret)) throw new Error('secret leaked in HTTP response');
  }

  console.log('RELEASE_IMAGE_SMOKE: PASS');
} catch (err) {
  failed = true;
  console.error('RELEASE_IMAGE_SMOKE: FAIL', err?.message || err);
  compose(['logs', '--no-color', '--tail', 120], { allowFail: true, stdio: 'inherit' });
} finally {
  console.log(`== cleanup project ${project} ==`);
  compose(['down', '-v', '--remove-orphans'], { allowFail: true, stdio: 'inherit' });
  try {
    fs.rmSync(work, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

process.exit(failed ? 1 : 0);
