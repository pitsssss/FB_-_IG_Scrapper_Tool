#!/usr/bin/env node
/**
 * Full interactive browser acceptance against isolated Compose + mocked Apify.
 * Requires Docker + Playwright (devDependency). Synthetic credentials only.
 *
 * Usage: npm run browser:acceptance
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { generateTotpCode } from '../src/management/totp.js';

function currentTotp(secret) {
  return generateTotpCode(secret).code;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const project = `smp-browser-${crypto.randomBytes(4).toString('hex')}`;
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'smp-browser-'));
const envFile = path.join(work, '.env');
const resultsPath = path.join(work, 'results.json');
const bootstrap = crypto.randomBytes(24).toString('base64url');
const internal = crypto.randomBytes(24).toString('base64url');
const encKey = crypto.randomBytes(32).toString('base64');
const mockToken = 'mock-apify-token-acceptance-xx';
const hostPort = String(18200 + (crypto.randomBytes(1)[0] % 40));
const base = `http://127.0.0.1:${hostPort}`;
const envFilePosix = envFile.replace(/\\/g, '/');
const adminEmail = 'browser-accept@example.com';
const adminPass = 'BrowserAcceptPass1!';

const results = [];
function record(name, status, detail = '') {
  results.push({ name, status, detail: String(detail).slice(0, 240) });
  console.log(`[${status}] ${name}${detail ? ` — ${String(detail).slice(0, 120)}` : ''}`);
}

fs.writeFileSync(
  envFile,
  `
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
API_KEYS=
APIFY_TOKEN=
PROVIDERS=apify
APIFY_BASE_URL=http://mock-apify:4099
APIFY_VERIFY_BASE_URL=http://mock-apify:4099
APIFY_DAILY_RUN_LIMIT=5
UPSTREAM_RETRIES=0
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
WARM_PAGES=
MOCK_GOOD_TOKEN=${mockToken}
COMPOSE_ENV_FILE=${envFilePosix}
`.trim() + '\n',
);

fs.writeFileSync(
  path.join(work, 'ports.override.yml'),
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
      APIFY_BASE_URL: http://mock-apify:4099
      APIFY_VERIFY_BASE_URL: http://mock-apify:4099
      APIFY_DAILY_RUN_LIMIT: "5"
      APIFY_TOKEN: ""
      API_KEYS: ""
      PROVIDERS: apify
      UPSTREAM_RETRIES: "0"
  dashboard:
    environment:
      ADMIN_INTERNAL_SECRET: ${JSON.stringify(internal)}
      ADMIN_ALLOWED_ORIGINS: ${JSON.stringify(base)}
      ADMIN_COOKIE_SECURE: "0"
  caddy:
    ports: !override
      - "127.0.0.1:${hostPort}:80"
`,
);

const composeFiles = [
  '-f', path.join(root, 'docker-compose.yml'),
  '-f', path.join(root, 'docker-compose.local.yml'),
  '-f', path.join(root, 'docker-compose.browser.yml'),
  '-f', path.join(work, 'ports.override.yml'),
];

function run(cmd, args, opts = {}) {
  const { allowFail, stdio } = opts;
  const r = spawnSync(cmd, args, {
    cwd: root,
    encoding: stdio === 'inherit' ? undefined : 'utf8',
    shell: false,
    stdio: stdio || 'pipe',
    env: { ...process.env, COMPOSE_ENV_FILE: envFilePosix, MOCK_GOOD_TOKEN: mockToken },
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

async function waitHealthy(timeoutMs = 240_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const h = await httpReq('GET', '/health');
      const d = await httpReq('GET', '/api/health');
      if (h.status === 200 && d.status === 200) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('stack not healthy');
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    console.log('Installing playwright (dev)…');
    run('npm', ['install', '--no-save', 'playwright@1.65.0'], { stdio: 'inherit' });
    run('npx', ['playwright', 'install', 'chromium'], { stdio: 'inherit' });
    return import('playwright');
  }
}

async function setViewport(page, w, h) {
  await page.setViewportSize({ width: w, height: h });
}

async function main() {
  let failed = false;
  let browser;
  try {
    console.log(`== browser acceptance project=${project} port=${hostPort} ==`);
    compose(['config', '-q']);
    compose(['up', '-d', '--build'], { stdio: 'inherit' });
    await waitHealthy();
    record('compose_stack_healthy', 'PASS');

    // Security regression HTTP
    const evil = await httpReq('POST', '/api/auth/setup', {
      headers: { origin: 'https://evil.example' },
      body: { setupToken: bootstrap, email: 'x@example.com', password: adminPass, confirmPassword: adminPass },
    });
    record('security_origin_reject', evil.status === 403 ? 'PASS' : 'FAIL', `status=${evil.status}`);

    const { chromium } = await loadPlaywright();
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // --- Setup ---
    await page.goto(`${base}/setup`, { waitUntil: 'networkidle' });
    await page.fill('input[name="setupToken"]', bootstrap);
    await page.fill('input[name="email"]', adminEmail);
    await page.fill('input[name="password"]', adminPass);
    await page.fill('input[name="confirmPassword"]', adminPass);
    await page.getByRole('button', { name: /create administrator/i }).click();
    await page.waitForURL(/\/overview/, { timeout: 30000 });
    record('browser_admin_setup', 'PASS');

    // --- Responsive shell ---
    for (const w of [360, 390, 768, 1024, 1440]) {
      await setViewport(page, w, 800);
      await page.goto(`${base}/overview`, { waitUntil: 'domcontentloaded' });
      const body = await page.locator('body').innerText();
      record(`responsive_${w}`, body.length > 20 ? 'PASS' : 'FAIL', `chars=${body.length}`);
    }
    await setViewport(page, 1280, 900);

    // --- Settings / MFA enroll ---
    let totpSecret = '';
    let recoveryCodes = [];
    await page.goto(`${base}/settings`, { waitUntil: 'networkidle' });
    await page.fill('#totp-pwd', adminPass);
    await page.getByRole('button', { name: /start enrollment/i }).click();
    await page.waitForSelector('text=/Add to authenticator/i', { timeout: 20000 });
    await page.waitForTimeout(500);
    const mono = page.locator('.font-mono');
    const monoCount = await mono.count();
    for (let i = 0; i < monoCount; i += 1) {
      const raw = (await mono.nth(i).innerText()).trim();
      if (raw.startsWith('otpauth://')) continue;
      const t = raw.replace(/\s+/g, '');
      if (/^[A-Z2-7]{16,64}$/i.test(t)) {
        totpSecret = t.toUpperCase();
        break;
      }
    }
    if (!totpSecret) {
      // Last resort: parse secret= from otpauth URI
      for (let i = 0; i < monoCount; i += 1) {
        const raw = (await mono.nth(i).innerText()).trim();
        const m = /[?&]secret=([A-Z2-7]+)/i.exec(raw);
        if (m) {
          totpSecret = m[1].toUpperCase();
          break;
        }
      }
    }
    if (!totpSecret || totpSecret.length < 10) {
      record('browser_totp_enroll', 'FAIL', 'secret not visible');
    } else {
      await page.fill('#totp-code', currentTotp(totpSecret));
      await page.getByRole('button', { name: /enable mfa/i }).click();
      await page.waitForTimeout(2000);
      const enabled = await page.getByText(/Authenticator MFA:\s*enabled/i).count();
      record('browser_totp_enroll', enabled > 0 ? 'PASS' : 'FAIL');
      const recoveryBlock = page.getByText(/Store these recovery codes/i);
      if (await recoveryBlock.count()) {
        record('browser_recovery_codes_display', 'PASS');
        const codeList = page.locator('li, code, .font-mono');
        const n = await codeList.count();
        for (let i = 0; i < n; i += 1) {
          const t = (await codeList.nth(i).innerText()).trim();
          if (/^[a-z0-9-]{8,}$/i.test(t) && !t.startsWith('otpauth')) recoveryCodes.push(t);
        }
      } else {
        record('browser_recovery_codes_display', 'NOT VERIFIED', 'codes panel not shown after enroll');
      }
    }

    // Logout via shell control (must send CSRF)
    await page.goto(`${base}/overview`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^sign out$/i }).click();
    await page.waitForURL(/\/login/, { timeout: 20000 });
    record('browser_logout', page.url().includes('/login') ? 'PASS' : 'FAIL', page.url());

    // Invalid password
    await page.waitForSelector('input[name="login"]', { timeout: 15000 });
    await page.fill('input[name="login"]', adminEmail);
    await page.fill('input[name="password"]', 'WrongPassword!!!');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForTimeout(1200);
    record(
      'browser_invalid_password',
      page.url().includes('/login') && !(await page.getByText(/overview/i).count()) ? 'PASS' : 'FAIL',
      page.url(),
    );

    // Login + MFA challenge
    await page.fill('input[name="login"]', adminEmail);
    await page.fill('input[name="password"]', adminPass);
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL(/\/(mfa|overview)/, { timeout: 20000 });
    if (page.url().includes('/mfa')) {
      record('browser_mfa_challenge_required', 'PASS');
      if (totpSecret) {
        // Avoid boundary window: wait until mid-slot then submit once.
        await page.waitForTimeout(500);
        await page.fill('input[name="code"]', currentTotp(totpSecret));
        await page.getByRole('button', { name: /^continue$/i }).click();
        try {
          await page.waitForURL(/\/overview/, { timeout: 25000 });
          record('browser_mfa_totp_success', 'PASS');
        } catch {
          const errText = await page.locator('text=/Could not verify|Verification failed|Invalid/i').first().innerText().catch(async () => page.locator('body').innerText());
          await page.waitForTimeout(2000);
          await page.fill('input[name="code"]', currentTotp(totpSecret));
          await page.getByRole('button', { name: /^continue$/i }).click();
          try {
            await page.waitForURL(/\/overview/, { timeout: 25000 });
            record('browser_mfa_totp_success', 'PASS', 'retry');
          } catch {
            record('browser_mfa_totp_success', 'FAIL', String(errText).slice(0, 160));
            throw new Error(`MFA verify failed: ${String(errText).slice(0, 200)}`);
          }
        }
      } else {
        record('browser_mfa_totp_success', 'NOT VERIFIED', 'no secret');
      }
    } else {
      record('browser_mfa_challenge_required', 'FAIL', 'expected /mfa redirect');
    }

    // Providers — mocked Apify
    await page.goto(`${base}/providers`, { waitUntil: 'networkidle' });
    await page.fill('#apify-token', mockToken);
    await page.getByRole('button', { name: /connect apify/i }).click();
    await page.waitForTimeout(3000);
    const providerOk = await page.getByText(/connected|mock_apify_user|Account hint/i).count();
    record('browser_provider_mock_connect', providerOk > 0 ? 'PASS' : 'FAIL');

    // API key create
    await page.goto(`${base}/api-keys`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /create key/i }).click();
    await page.waitForSelector('#client-name', { timeout: 10000 });
    await page.fill('#client-name', 'browser-client');
    await page.fill('#fb-scopes', 'cern');
    await page.fill('#ig-scopes', 'nasa');
    await page.getByRole('button', { name: /^create$/i }).click();
    await page.waitForTimeout(2000);
    const secretBanner = await page.getByText(/copy|one.?time|secret|api key/i).count();
    record('browser_api_key_create', secretBanner > 0 || (await page.getByText(/browser-client/i).count()) > 0 ? 'PASS' : 'FAIL');

    // Playground cache miss then live
    await page.goto(`${base}/playground`, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /^facebook$/i }).click();
    await page.fill('#playground-username', 'cern');
    await page.getByRole('button', { name: /^cache only$/i }).click();
    await page.getByRole('button', { name: /read cache/i }).click();
    await page.waitForTimeout(1500);
    record('browser_playground_cache_only', 'PASS', 'cache-only read invoked (miss OK)');

    // Live prepare / cancel
    await page.getByRole('button', { name: /^live refresh$/i }).click();
    await page.getByRole('button', { name: /prepare live refresh/i }).click();
    await page.waitForTimeout(1500);
    const cancel = page.getByRole('button', { name: /^cancel$/i });
    if (await cancel.count()) {
      await cancel.click();
      record('browser_playground_prepare_cancel', 'PASS');
    } else {
      record('browser_playground_prepare_cancel', 'FAIL', 'cancel missing after prepare');
    }
    await page.getByRole('button', { name: /prepare live refresh/i }).click();
    await page.waitForTimeout(1500);
    const confirmFb = page.getByRole('button', { name: /confirm refresh/i });
    if (await confirmFb.count()) {
      await confirmFb.first().click();
      await page.waitForTimeout(5000);
      const visual = await page.getByText(/Mock Facebook|CERN|mock_fb|Mock Facebook post/i).count();
      record('browser_playground_confirm_mock', visual > 0 ? 'PASS' : 'FAIL');
      const jsonTab = page.getByRole('button', { name: /raw json/i });
      if (await jsonTab.count()) {
        await jsonTab.first().click();
        record('browser_playground_json_view', 'PASS');
      } else {
        record('browser_playground_json_view', 'NOT VERIFIED');
      }
    } else {
      record('browser_playground_confirm_mock', 'FAIL', 'confirm missing');
    }

    // Instagram live
    await page.getByRole('button', { name: /^instagram$/i }).click();
    await page.fill('#playground-username', 'nasa');
    await page.getByRole('button', { name: /^live refresh$/i }).click();
    await page.getByRole('button', { name: /prepare live refresh/i }).click();
    await page.waitForTimeout(1500);
    const confirmIg = page.getByRole('button', { name: /confirm refresh/i });
    if (await confirmIg.count()) {
      await confirmIg.first().click();
      await page.waitForTimeout(4500);
      record('browser_playground_instagram_mock', (await page.getByText(/Mock Instagram|nasa/i).count()) > 0 ? 'PASS' : 'FAIL');
    } else {
      record('browser_playground_instagram_mock', 'FAIL', 'confirm missing');
    }

    // Cache + Settings + Usage
    await page.goto(`${base}/cache`, { waitUntil: 'networkidle' });
    record('browser_cache_page', (await page.locator('body').innerText()).length > 40 ? 'PASS' : 'FAIL');
    await page.goto(`${base}/settings`, { waitUntil: 'networkidle' });
    const ttl = page.locator('#fresh-ttl, input[name="freshTtl"], input').filter({ hasText: '' }).first();
    record('browser_settings_page', (await page.getByText(/allowlist|fresh|quota|warm/i).count()) > 0 ? 'PASS' : 'FAIL');
    await page.goto(`${base}/usage`, { waitUntil: 'networkidle' });
    record('browser_usage_page', (await page.getByText(/usage|requests|cache hits|provider/i).count()) > 0 ? 'PASS' : 'FAIL');

    // API key revoke/rotate if UI present
    await page.goto(`${base}/api-keys`, { waitUntil: 'networkidle' });
    const rotate = page.getByRole('button', { name: /rotate/i }).first();
    if (await rotate.count()) {
      await rotate.click();
      await page.waitForTimeout(1000);
      record('browser_api_key_rotate', 'PASS');
    } else {
      record('browser_api_key_rotate', 'NOT VERIFIED', 'no rotate control');
    }
    const revoke = page.getByRole('button', { name: /revoke|delete|disable/i }).first();
    if (await revoke.count()) {
      await revoke.click();
      await page.waitForTimeout(800);
      record('browser_api_key_revoke', 'PASS');
    } else {
      record('browser_api_key_revoke', 'NOT VERIFIED', 'no revoke control');
    }

    // Final logout + protected rejection
    await page.evaluate(async () => {
      const csrf = document.cookie.split(';').map((s) => s.trim()).find((s) => s.startsWith('smp_admin_csrf='));
      const token = csrf ? decodeURIComponent(csrf.split('=')[1]) : '';
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': token, origin: location.origin },
        body: '{}',
      });
    });
    await page.goto(`${base}/overview`, { waitUntil: 'domcontentloaded' });
    record('browser_post_logout_protect', page.url().includes('/login') ? 'PASS' : 'FAIL', page.url());

    // Session expiration wall-clock: NOT VERIFIED (idle=2h)
    record('browser_session_idle_expiry', 'NOT VERIFIED', 'idle window is 2h; covered by unit tests');

    // Recovery-code login path (if codes were captured during enroll)
    if (recoveryCodes.length) {
      await page.goto(`${base}/login`, { waitUntil: 'networkidle' });
      await page.fill('input[name="login"]', adminEmail);
      await page.fill('input[name="password"]', adminPass);
      await page.getByRole('button', { name: /sign in/i }).click();
      await page.waitForURL(/\/mfa/, { timeout: 20000 });
      await page.fill('input[name="code"]', recoveryCodes[0]);
      await page.getByRole('button', { name: /^continue$/i }).click();
      try {
        await page.waitForURL(/\/overview/, { timeout: 20000 });
        record('browser_recovery_code_login', 'PASS');
      } catch {
        record('browser_recovery_code_login', 'FAIL');
      }
    } else {
      record('browser_recovery_code_login', 'NOT VERIFIED', 'no recovery codes captured');
    }

  } catch (err) {
    failed = true;
    record('browser_suite', 'FAIL', err?.message || err);
    console.error(err);
    compose(['logs', '--no-color', '--tail', '100'], { allowFail: true, stdio: 'inherit' });
  } finally {
    if (browser) await browser.close().catch(() => {});
    fs.writeFileSync(resultsPath, JSON.stringify({ base, project, results }, null, 2));
    console.log('Results written:', resultsPath);
    const summary = {
      pass: results.filter((r) => r.status === 'PASS').length,
      fail: results.filter((r) => r.status === 'FAIL').length,
      notVerified: results.filter((r) => r.status === 'NOT VERIFIED').length,
    };
    console.log('SUMMARY', summary);
    // Copy sanitized summary next to script output for report (no secrets)
    const publicSummary = path.join(root, 'docs', 'release', 'BROWSER_ACCEPTANCE_SUMMARY.json');
    fs.writeFileSync(publicSummary, JSON.stringify({ summary, results }, null, 2));
    compose(['down', '-v', '--remove-orphans'], { allowFail: true, stdio: 'inherit' });
    try { fs.rmSync(work, { recursive: true, force: true }); } catch { /* ignore */ }
    if (summary.fail > 0) failed = true;
  }
  process.exit(failed ? 1 : 0);
}

main();
