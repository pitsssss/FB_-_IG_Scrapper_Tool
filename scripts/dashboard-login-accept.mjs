import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const project = `smp-login-accept-${crypto.randomBytes(3).toString("hex")}`;
const work = fs.mkdtempSync(path.join(os.tmpdir(), "smp-login-accept-"));
const envFile = path.join(work, ".env");
const outDir = path.join(os.tmpdir(), "smp-login-review");
fs.mkdirSync(outDir, { recursive: true });

const bootstrap = crypto.randomBytes(24).toString("base64url");
const internal = crypto.randomBytes(24).toString("base64url");
const encKey = crypto.randomBytes(32).toString("base64");
const hostPort = String(18620 + (crypto.randomBytes(1)[0] % 40));
const base = `http://127.0.0.1:${hostPort}`;
const adminEmail = "login-accept@example.com";
const adminPass = "LoginAcceptPass1!";
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
      env: {
        ...process.env,
        COMPOSE_ENV_FILE: envFilePosix,
        MOCK_GOOD_TOKEN: "mock-apify-token-acceptance-xx",
      },
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
  throw new Error("not healthy");
}

const viewports = [
  [390, 844],
  [768, 1024],
  [1024, 768],
  [1366, 768],
  [1920, 1080],
];

let failed = 0;
const results = [];

try {
  console.log(`project=${project} base=${base}`);
  compose(["up", "-d", "--build"], true);
  await waitHealthy();

  const browser = await chromium.launch({ headless: true });
  const setup = await browser.newContext();
  const setupPage = await setup.newPage();
  await setupPage.goto(`${base}/setup`, { waitUntil: "networkidle" });
  await setupPage.fill('input[name="setupToken"]', bootstrap);
  await setupPage.fill('input[name="email"]', adminEmail);
  await setupPage.fill('input[name="password"]', adminPass);
  await setupPage.fill('input[name="confirmPassword"]', adminPass);
  await setupPage.getByRole("button", { name: /create administrator/i }).click();
  await setupPage.waitForURL(/\/overview/, { timeout: 30000 });
  await setupPage.getByRole("button", { name: /sign out/i }).first().click();
  await setupPage.waitForURL(/\/login/, { timeout: 20000 });
  await setup.close();

  // invalid password
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${base}/login`, { waitUntil: "networkidle" });
    await page.fill("#login", adminEmail);
    await page.fill("#password", "DefinitelyWrongPass1!");
    await page.getByRole("button", { name: /^sign in$/i }).click();
    await page.waitForTimeout(800);
    const row = {
      case: "invalid-password",
      url: page.url(),
      hasError: await page.getByText(/could not sign in|invalid|unauthorized|failed/i).count(),
      hasOverview: await page.getByRole("heading", { name: /^overview$/i }).count(),
    };
    if (!page.url().includes("/login") || row.hasError < 1 || row.hasOverview > 0) {
      failed += 1;
      row.bad = true;
    }
    results.push(row);
    await context.close();
  }

  // unauthenticated overview
  {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${base}/overview`, { waitUntil: "networkidle" });
    const row = { case: "direct-overview", url: page.url() };
    if (!page.url().includes("/login")) {
      failed += 1;
      row.bad = true;
    }
    results.push(row);
    await context.close();
  }

  // Successful login once per viewport (stay under auth login_user rate max of 10).
  // Extra back-to-back cycle on desktop only to cover repeated login without refresh.
  const loginPlan = [
    ...viewports.map(([width, height]) => ({ width, height, cycle: 1 })),
    { width: 1366, height: 768, cycle: 2 },
  ];

  for (const { width, height, cycle } of loginPlan) {
    const context = await browser.newContext({ viewport: { width, height } });
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(String(err)));

    await page.goto(`${base}/login`, { waitUntil: "networkidle" });
    await page.fill("#login", adminEmail);
    await page.fill("#password", adminPass);
    const loginWait = page.waitForResponse(
      (r) => r.url().includes("/api/auth/login") && r.request().method() === "POST",
      { timeout: 15000 },
    );
    await page.getByRole("button", { name: /^sign in$/i }).click();
    const loginRes = await loginWait;
    const loginStatus = loginRes.status();
    try {
      await page.waitForURL(/\/overview/, { timeout: 20000 });
    } catch (error) {
      const bodyText = await page.locator("body").innerText().catch(() => "");
      await page.screenshot({
        path: path.join(outDir, `login-fail-${width}x${height}-cycle${cycle}.png`),
        fullPage: true,
      });
      throw new Error(
        `login navigation failed status=${loginStatus} url=${page.url()} text=${bodyText.slice(0, 240)} cause=${error}`,
      );
    }
    await page.getByRole("heading", { name: /^overview$/i }).waitFor({ timeout: 10000 });
    await page.getByText(/API health/i).first().waitFor({ timeout: 10000 });

    const text = await page.locator("body").innerText();
    const cookies = await context.cookies();
    const row = {
      case: `login-${width}x${height}-cycle${cycle}`,
      url: page.url(),
      hasOverview: /Overview/i.test(text),
      hasApiHealth: /API health/i.test(text),
      hasSession: cookies.some((c) => c.name === "smp_admin_session"),
      consoleErrors,
      refreshed: false,
      loginStatus,
    };
    if (!row.hasOverview || !row.hasApiHealth || !row.hasSession || consoleErrors.length) {
      failed += 1;
      row.bad = true;
    }
    if (cycle === 1 && width === 390) {
      await page.screenshot({
        path: path.join(outDir, "login-success-390.png"),
        fullPage: false,
      });
    }
    if (cycle === 1 && width === 1366) {
      await page.screenshot({
        path: path.join(outDir, "login-success-1366.png"),
        fullPage: false,
      });
    }

    // persistence after refresh
    await page.reload({ waitUntil: "networkidle" });
    const afterReload =
      page.url().includes("/overview") &&
      (await page.getByRole("heading", { name: /^overview$/i }).count()) > 0;
    if (!afterReload) {
      failed += 1;
      row.reloadFailed = true;
    }

    // logout — open the drawer on narrow viewports where Sign out lives
    if (width < 1280) {
      await page.getByRole("button", { name: /open navigation/i }).click();
      await page.waitForSelector("[data-mobile-nav-panel='true']");
      await page.getByRole("dialog").getByRole("button", { name: /sign out/i }).click();
    } else {
      await page.getByRole("button", { name: /sign out/i }).click();
    }
    await page.waitForURL(/\/login/, { timeout: 20000 });
    const afterLogout = page.url().includes("/login");
    if (!afterLogout) {
      failed += 1;
      row.logoutFailed = true;
    }

    results.push(row);
    await context.close();
  }

  await browser.close();
  const report = path.join(outDir, "report.json");
  fs.writeFileSync(report, JSON.stringify({ base, project, failed, results }, null, 2));
  console.log(JSON.stringify({ report, failed, cycles: results.filter((r) => String(r.case).startsWith("login-")).length }, null, 2));
  if (failed) process.exitCode = 1;
} finally {
  try {
    compose(["down"], true);
  } catch (error) {
    console.error(String(error));
  }
}
