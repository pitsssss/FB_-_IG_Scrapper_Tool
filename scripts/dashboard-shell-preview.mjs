import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const project = `smp-ui-shell-${crypto.randomBytes(3).toString("hex")}`;
const work = fs.mkdtempSync(path.join(os.tmpdir(), "smp-ui-shell-"));
const envFile = path.join(work, ".env");
const outDir = path.join(os.tmpdir(), "smp-ui-review");
fs.mkdirSync(outDir, { recursive: true });
const bootstrap = crypto.randomBytes(24).toString("base64url");
const internal = crypto.randomBytes(24).toString("base64url");
const encKey = crypto.randomBytes(32).toString("base64");
const hostPort = String(18320 + (crypto.randomBytes(1)[0] % 40));
const base = `http://127.0.0.1:${hostPort}`;
const adminEmail = "ui-review@example.com";
const adminPass = "UiReviewPass1!";
const envFilePosix = envFile.replace(/\\/g, "/");

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
    "APIFY_DAILY_RUN_LIMIT=5",
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
    "MOCK_GOOD_TOKEN=mock-apify-token-acceptance-xx",
    `COMPOSE_ENV_FILE=${envFilePosix}`,
    "",
  ].join("\n"),
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
  "-f",
  path.join(root, "docker-compose.yml"),
  "-f",
  path.join(root, "docker-compose.local.yml"),
  "-f",
  path.join(root, "docker-compose.browser.yml"),
  "-f",
  path.join(work, "ports.override.yml"),
];

function compose(args, inherit = false) {
  const r = spawnSync(
    "docker",
    ["compose", "-p", project, ...composeFiles, "--env-file", envFile, ...args],
    {
      cwd: root,
      encoding: inherit ? undefined : "utf8",
      stdio: inherit ? "inherit" : "pipe",
      env: { ...process.env, COMPOSE_ENV_FILE: envFilePosix, MOCK_GOOD_TOKEN: "mock-apify-token-acceptance-xx" },
    },
  );
  if (r.status !== 0) {
    if (!inherit) {
      console.error(r.stdout || "");
      console.error(r.stderr || "");
    }
    throw new Error(`docker compose ${args.join(" ")} failed (${r.status})`);
  }
}

async function waitHealthy() {
  const start = Date.now();
  while (Date.now() - start < 240000) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("isolated stack not healthy");
}

const viewports = [
  [320, 667],
  [360, 800],
  [390, 844],
  [430, 932],
  [768, 1024],
  [820, 1180],
  [1024, 768],
  [1280, 720],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
  [2560, 1440],
];
const routes = ["/overview", "/playground", "/api-keys", "/providers", "/cache", "/usage", "/settings", "/docs"];
const shotKeys = new Set(["320x667", "390x844", "768x1024", "1024x768", "1280x720", "1440x900", "1920x1080"]);

let failed = 0;
try {
  console.log(`isolated project ${project} port ${hostPort}`);
  compose(["up", "-d", "--build"], true);
  await waitHealthy();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${base}/setup`, { waitUntil: "networkidle" });
  await page.fill('input[name="setupToken"]', bootstrap);
  await page.fill('input[name="email"]', adminEmail);
  await page.fill('input[name="password"]', adminPass);
  await page.fill('input[name="confirmPassword"]', adminPass);
  await page.getByRole("button", { name: /create administrator/i }).click();
  await page.waitForURL(/\/overview/, { timeout: 30000 });

  const results = [];
  for (const [width, height] of viewports) {
    const label = `${width}x${height}`;
    await page.setViewportSize({ width, height });
    for (const route of routes) {
      await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(200);
      const metrics = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        path: location.pathname,
        hamburger: (() => {
          const button = document.querySelector("[aria-label='Open navigation']");
          const box = button?.getBoundingClientRect();
          return Boolean(box && box.width > 0 && box.height > 0);
        })(),
        sidebar: (() => {
          const aside = document.querySelector("aside");
          const box = aside?.getBoundingClientRect();
          return Boolean(box && box.width > 0 && box.height > 0);
        })(),
      }));
      const overflow = metrics.scrollWidth > metrics.clientWidth + 1;
      let drawerOverflow = null;
      if (metrics.hamburger) {
        await page.getByRole("button", { name: /open navigation/i }).click();
        await page.waitForTimeout(100);
        drawerOverflow = await page.evaluate(() => {
          const dialog = document.querySelector("[role=dialog]");
          return {
            open: Boolean(dialog),
            overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          };
        });
        await page.keyboard.press("Escape");
        await page.waitForTimeout(80);
      }
      const row = { viewport: label, route, overflow, drawerOverflow, ...metrics };
      if (overflow || (drawerOverflow && drawerOverflow.overflow) || metrics.path !== route) {
        failed += 1;
        row.bad = true;
      }
      if (shotKeys.has(label) && (route === "/overview" || route === "/playground" || route === "/settings")) {
        const file = path.join(outDir, `shell-${label}-${route.slice(1)}.png`);
        await page.screenshot({ path: file, fullPage: false });
        row.screenshot = file;
      }
      results.push(row);
    }
  }
  await browser.close();
  const report = path.join(outDir, "shell-report.json");
  fs.writeFileSync(report, JSON.stringify({ base, project, failed, results }, null, 2));
  console.log(JSON.stringify({ report, failed, screenshots: results.filter((r) => r.screenshot).map((r) => r.screenshot) }, null, 2));
  if (failed) process.exitCode = 1;
} finally {
  try {
    compose(["down"], true);
  } catch (error) {
    console.error(String(error));
  }
}
