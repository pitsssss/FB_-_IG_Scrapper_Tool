#!/usr/bin/env node
/**
 * Isolated dashboard screenshot gallery capture.
 * Spins a disposable Compose project (never owner :8080), synthetic admin only,
 * mock Apify, APIFY_DAILY_RUN_LIMIT=0. Does not commit or push.
 *
 * Usage: node scripts/capture-dashboard-gallery.mjs
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const project = `smp-gallery-${crypto.randomBytes(3).toString("hex")}`;
const work = fs.mkdtempSync(path.join(os.tmpdir(), "smp-gallery-"));
const envFile = path.join(work, ".env");
const credsFile = path.join(work, "credentials.json");
const outDir = path.join(root, "docs", "assets", "screenshots");
const sourceDir = path.join(outDir, "_source");
const hostPort = String(18520 + (crypto.randomBytes(1)[0] % 40));
const base = `http://127.0.0.1:${hostPort}`;
const bootstrap = crypto.randomBytes(24).toString("base64url");
const internal = crypto.randomBytes(24).toString("base64url");
const encKey = crypto.randomBytes(32).toString("base64");
const mockToken = "mock-apify-token-gallery-xx";
const adminEmail = "gallery-demo@example.com";
const adminPass = `GalleryDemo!${crypto.randomBytes(4).toString("hex")}`;
const envFilePosix = envFile.replace(/\\/g, "/");

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(sourceDir, { recursive: true });

fs.writeFileSync(
  envFile,
  [
    "PORT=3000",
    "HOST=0.0.0.0",
    "NODE_ENV=production",
    "API_KEYS=",
    "APIFY_TOKEN=",
    "PROVIDERS=apify",
    "APIFY_BASE_URL=http://mock-apify:4099",
    "APIFY_VERIFY_BASE_URL=http://mock-apify:4099",
    "APIFY_DAILY_RUN_LIMIT=0",
    "INSTAGRAM_PROFILE_ENRICHMENT=0",
    "UPSTREAM_RETRIES=0",
    "CACHE_DIR=/data/cache",
    "MANAGEMENT_DIR=/data/management",
    `BOOTSTRAP_SETUP_TOKEN=${bootstrap}`,
    `ADMIN_INTERNAL_SECRET=${internal}`,
    `DATA_ENCRYPTION_KEY=${encKey}`,
    `ADMIN_ALLOWED_ORIGINS=${base}`,
    "ADMIN_COOKIE_SECURE=0",
    "TRUST_PROXY=1",
    "API_DOMAIN=localhost",
    "ALLOWED_PAGES=cern",
    "INSTAGRAM_ALLOWED_PROFILES=nasa",
    "MAX_POSTS=10",
    "WARM_PAGES=",
    `MOCK_GOOD_TOKEN=${mockToken}`,
    `COMPOSE_ENV_FILE=${envFilePosix}`,
    "",
  ].join("\n"),
);

fs.writeFileSync(
  credsFile,
  JSON.stringify({ adminEmail, note: "temp only — not for publish" }, null, 2),
);

fs.writeFileSync(
  path.join(work, "ports.override.yml"),
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
      APIFY_DAILY_RUN_LIMIT: "0"
      INSTAGRAM_PROFILE_ENRICHMENT: "0"
      APIFY_TOKEN: ""
      API_KEYS: ""
      PROVIDERS: apify
      UPSTREAM_RETRIES: "0"
      WARM_PAGES: ""
      ALLOWED_PAGES: cern
      INSTAGRAM_ALLOWED_PROFILES: nasa
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
  "-f",
  path.join(root, "docker-compose.yml"),
  "-f",
  path.join(root, "docker-compose.local.yml"),
  "-f",
  path.join(root, "docker-compose.browser.yml"),
  "-f",
  path.join(work, "ports.override.yml"),
];

const manifest = {
  capturedAt: new Date().toISOString(),
  project,
  base,
  hostPort,
  theme: "light",
  paidApifyCalls: false,
  apifyDailyRunLimit: 0,
  fixtures: [],
  screenshots: [],
  errors: [],
};

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    encoding: opts.stdio === "inherit" ? undefined : "utf8",
    stdio: opts.stdio || "pipe",
    env: {
      ...process.env,
      COMPOSE_ENV_FILE: envFilePosix,
      MOCK_GOOD_TOKEN: mockToken,
    },
  });
  if (r.status !== 0 && !opts.allowFail) {
    if (opts.stdio !== "inherit") {
      console.error(r.stdout || "");
      console.error(r.stderr || "");
    }
    throw new Error(`${cmd} ${args.join(" ")} failed (${r.status})`);
  }
  return r;
}

function compose(args, opts) {
  return run("docker", ["compose", "-p", project, ...composeFiles, "--env-file", envFile, ...args], opts);
}

function httpReq(method, urlPath) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlPath, base);
    const req = http.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function waitHealthy(timeoutMs = 300_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const h = await httpReq("GET", "/health");
      const d = await httpReq("GET", "/api/health");
      if (h.status === 200 && d.status === 200) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("isolated gallery stack not healthy");
}

async function forceLightTheme(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("theme", "light");
    } catch {
      /* ignore */
    }
  });
  await page.emulateMedia({ colorScheme: "light" });
}

async function waitSettled(page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForFunction(() => {
    const text = document.body?.innerText || "";
    return text.length > 40 && !/loading…|loading\.\.\./i.test(text.slice(0, 80));
  }, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(400);
}

async function shot(page, fileName, meta) {
  const dest = path.join(outDir, fileName);
  const srcCopy = path.join(sourceDir, fileName);
  const fullPage = Boolean(meta.fullPage);
  await page.screenshot({ path: dest, fullPage, type: "png" });
  fs.copyFileSync(dest, srcCopy);
  const entry = {
    file: fileName,
    route: meta.route,
    viewport: fullPage ? `${meta.viewport || "1440x900"}+fullPage` : meta.viewport,
    note: meta.note || "",
    syntheticFixture: Boolean(meta.syntheticFixture),
    fullPage,
    bytes: fs.statSync(dest).size,
  };
  manifest.screenshots.push(entry);
  console.log(`[ok] ${fileName} (${entry.bytes} bytes) — ${meta.route}`);
  return dest;
}

async function ensureNotLogin(page) {
  const url = page.url();
  if (/\/login|\/setup/i.test(url)) {
    throw new Error(`unexpected auth page: ${url}`);
  }
  const body = await page.locator("body").innerText();
  if (/sign in to continue|create administrator/i.test(body) && !/signed in as/i.test(body)) {
    throw new Error(`looks like unauthenticated shell at ${url}`);
  }
}

async function main() {
  let browser;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    console.log(`== cleanup disposable project ${project} ==`);
    compose(["down", "-v", "--remove-orphans"], { allowFail: true, stdio: "inherit" });
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });

  try {
    console.log(`== gallery capture project=${project} port=${hostPort} work=${work} ==`);
    compose(["config", "-q"]);
    compose(["up", "-d", "--build"], { stdio: "inherit" });
    await waitHealthy();
    console.log("stack healthy");

    const { chromium } = await import("playwright");
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: "light",
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await forceLightTheme(page);

    // Setup synthetic administrator
    await page.goto(`${base}/setup`, { waitUntil: "networkidle" });
    await page.fill('input[name="setupToken"]', bootstrap);
    await page.fill('input[name="email"]', adminEmail);
    await page.fill('input[name="password"]', adminPass);
    await page.fill('input[name="confirmPassword"]', adminPass);
    await page.getByRole("button", { name: /create administrator/i }).click();
    await page.waitForURL(/\/overview/, { timeout: 45000 });
    await waitSettled(page);
    await ensureNotLogin(page);

    // 01 Overview
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${base}/overview`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: /^Overview$/i }).waitFor({ timeout: 20000 });
    await waitSettled(page);
    await shot(page, "overview.png", {
      route: "/overview",
      viewport: "1440x900",
      note: "Empty/demo overview; Apify not connected; quota 0/0",
    });

    // 02 Facebook playground — Cache Only miss (honest empty)
    await page.goto(`${base}/playground`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: /API Playground/i }).waitFor();
    await page.getByRole("button", { name: /^Facebook$/i }).click();
    await page.fill("#playground-username", "cern");
    await page.getByRole("button", { name: /Cache only/i }).click();
    await page.getByRole("button", { name: /Read cache/i }).click();
    await page.getByRole("tab", { name: /Raw JSON/i }).waitFor({ timeout: 15000 }).catch(() => {});
    await page.getByText(/Exact envelope returned by the API/i).waitFor({ timeout: 10000 }).catch(() => {});
    // Wait for honest cache-miss / error envelope text (never fabricate success posts)
    await page.locator("pre, code, [data-testid='playground-json']").first().waitFor({ timeout: 10000 }).catch(() => {});
    await waitSettled(page);
    await shot(page, "facebook-playground.png", {
      route: "/playground",
      viewport: "1440x900",
      fullPage: true,
      note: "Facebook + Cache Only full page: request builder + cache-miss JSON — not a live scrape",
      syntheticFixture: false,
    });

    // 03 Instagram playground
    await page.getByRole("button", { name: /^Instagram$/i }).click();
    await page.fill("#playground-username", "nasa");
    await page.getByRole("button", { name: /Cache only/i }).click();
    await page.getByRole("button", { name: /Read cache/i }).click();
    await page.getByRole("tab", { name: /Raw JSON/i }).waitFor({ timeout: 15000 }).catch(() => {});
    await page.getByText(/Exact envelope returned by the API/i).waitFor({ timeout: 10000 }).catch(() => {});
    await page.locator("pre, code, [data-testid='playground-json']").first().waitFor({ timeout: 10000 }).catch(() => {});
    await waitSettled(page);
    await shot(page, "instagram-playground.png", {
      route: "/playground",
      viewport: "1440x900",
      fullPage: true,
      note: "Instagram + Cache Only full page: request builder + cache-miss JSON — not a live scrape",
      syntheticFixture: false,
    });

    // 04 API keys — create disposable key via same-origin fetch (never screenshot plaintext)
    await page.goto(`${base}/api-keys`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: /API Keys/i }).waitFor();
    const createResult = await page.evaluate(async () => {
      const res = await fetch("/api/management/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientName: "Demo-website",
          scopes: { facebook: ["cern"], instagram: ["nasa"] },
        }),
      });
      const body = await res.json().catch(() => ({}));
      // Strip secret from returned payload before anything leaves the page context
      if (body?.data?.key) body.data.key = "[redacted]";
      return { status: res.status, success: body?.success, error: body?.error || null, hasKey: Boolean(body?.data?.key) };
    });
    if (createResult.status >= 400 || createResult.success === false) {
      throw new Error(`API key create failed: ${JSON.stringify(createResult)}`);
    }
    await page.goto(`${base}/api-keys`, { waitUntil: "networkidle" });
    await page.getByText(/Demo-website/i).waitFor({ timeout: 15000 });
    // Ensure no one-time secret banner (we reloaded instead of showing it)
    if (await page.getByText(/Copy this key now/i).isVisible().catch(() => false)) {
      await page.getByRole("button", { name: /^Done$/i }).click();
    }
    await waitSettled(page);
    const keysBody = await page.locator("body").innerText();
    if (/Copy this key now/i.test(keysBody) || /\bsmp_[a-f0-9]+_[a-f0-9]+\b/i.test(keysBody)) {
      throw new Error("API key secret visible in UI — abort capture");
    }
    await shot(page, "api-keys.png", {
      route: "/api-keys",
      viewport: "1440x900",
      note: "Managed key metadata only (Demo-website); plaintext secret never captured",
    });

    // 05 Cache — honest empty
    await page.goto(`${base}/cache`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: /^Cache$/i }).waitFor();
    await waitSettled(page);
    await shot(page, "cache.png", {
      route: "/cache",
      viewport: "1440x900",
      note: "Empty cache listing with platform/freshness filters",
    });

    // 06 Connected providers — Not connected
    await page.goto(`${base}/providers`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: /Connected Providers/i }).waitFor();
    await waitSettled(page);
    await shot(page, "connected-providers.png", {
      route: "/providers",
      viewport: "1440x900",
      note: "Actual Not connected state — no fake Apify connection",
    });

    // 07 Usage & Logs
    await page.goto(`${base}/usage`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: /Usage & Logs/i }).waitFor();
    await waitSettled(page);
    await shot(page, "usage-logs.png", {
      route: "/usage",
      viewport: "1440x900",
      note: "Empty/synthetic local usage telemetry",
    });

    // 08 Settings — no MFA enroll (would expose secrets)
    await page.goto(`${base}/settings`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: /^Settings$/i }).waitFor();
    await waitSettled(page);
    await shot(page, "settings.png", {
      route: "/settings",
      viewport: "1440x900",
      note: "Settings shell; no secrets/MFA enrollment shown",
    });

    // 09 API Documentation
    await page.goto(`${base}/docs`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: /API Documentation/i }).waitFor();
    await waitSettled(page);
    await shot(page, "api-documentation.png", {
      route: "/docs",
      viewport: "1440x900",
      note: "In-app API documentation; no real keys in examples",
    });

    // 10 Mobile navigation drawer
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${base}/overview`, { waitUntil: "networkidle" });
    await waitSettled(page);
    await page.getByRole("button", { name: /open navigation/i }).click();
    await page.waitForSelector("[data-mobile-nav-panel='true']");
    await waitSettled(page);
    await shot(page, "mobile-navigation.png", {
      route: "/overview",
      viewport: "390x844",
      note: "Mobile drawer open",
    });

    // 11 Tablet navigation drawer
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(`${base}/overview`, { waitUntil: "networkidle" });
    await waitSettled(page);
    await page.getByRole("button", { name: /open navigation/i }).click();
    await page.waitForSelector("[data-mobile-nav-panel='true']");
    await waitSettled(page);
    await shot(page, "tablet-navigation.png", {
      route: "/overview",
      viewport: "768x1024",
      note: "Tablet drawer open",
    });

    await browser.close();
    browser = null;

    const required = [
      "overview.png",
      "facebook-playground.png",
      "instagram-playground.png",
      "api-keys.png",
      "cache.png",
      "connected-providers.png",
      "usage-logs.png",
      "settings.png",
      "api-documentation.png",
      "mobile-navigation.png",
      "tablet-navigation.png",
    ];
    const missing = required.filter((f) => !fs.existsSync(path.join(outDir, f)));
    if (missing.length) {
      manifest.errors.push({ type: "missing", files: missing });
      throw new Error(`missing screenshots: ${missing.join(", ")}`);
    }

    fs.writeFileSync(path.join(outDir, "CAPTURE_MANIFEST.json"), JSON.stringify(manifest, null, 2));
    fs.writeFileSync(path.join(work, "CAPTURE_MANIFEST.json"), JSON.stringify(manifest, null, 2));
    console.log(`manifest → ${path.join(outDir, "CAPTURE_MANIFEST.json")}`);
    console.log(JSON.stringify({ ok: true, count: manifest.screenshots.length, project, hostPort }, null, 2));
  } catch (err) {
    manifest.errors.push({ message: String(err?.stack || err) });
    fs.writeFileSync(path.join(work, "CAPTURE_MANIFEST.json"), JSON.stringify(manifest, null, 2));
    console.error(err);
    process.exitCode = 1;
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* ignore */
      }
    }
    cleanup();
  }
}

await main();
