import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const project = `smp-navfix-${crypto.randomBytes(3).toString("hex")}`;
const work = fs.mkdtempSync(path.join(os.tmpdir(), "smp-navfix-"));
const envFile = path.join(work, ".env");
const outDir = path.join(os.tmpdir(), "smp-nav-review");
fs.mkdirSync(outDir, { recursive: true });

const bootstrap = crypto.randomBytes(24).toString("base64url");
const internal = crypto.randomBytes(24).toString("base64url");
const encKey = crypto.randomBytes(32).toString("base64");
const hostPort = String(18420 + (crypto.randomBytes(1)[0] % 40));
const base = `http://127.0.0.1:${hostPort}`;
const adminEmail = "nav-review@example.com";
const adminPass = "NavReviewPass1!";
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
  throw new Error("isolated stack not healthy");
}

const viewports = [
  [320, 667],
  [360, 800],
  [375, 812],
  [390, 844],
  [414, 896],
  [430, 932],
  [600, 960],
  [768, 1024],
  [820, 1180],
  [1024, 768],
  [1180, 820],
  [1279, 800],
  [1280, 720],
  [1366, 768],
  [1440, 900],
  [1920, 1080],
];

const shotCases = [
  { label: "320x667", width: 320, height: 667, open: false },
  { label: "320x667-open", width: 320, height: 667, open: true },
  { label: "390x844", width: 390, height: 844, open: false },
  { label: "390x844-open", width: 390, height: 844, open: true },
  { label: "768x1024-open", width: 768, height: 1024, open: true },
  { label: "1024x768-open", width: 1024, height: 768, open: true },
  { label: "1279x800-open", width: 1279, height: 800, open: true },
  { label: "1280x720-sidebar", width: 1280, height: 720, open: false },
  { label: "1440x900-sidebar", width: 1440, height: 900, open: false },
];

function almostEqual(a, b, tol = 2) {
  return Math.abs(a - b) <= tol;
}

let failed = 0;
const results = [];

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

  for (const [width, height] of viewports) {
    const label = `${width}x${height}`;
    await page.setViewportSize({ width, height });
    await page.goto(`${base}/overview`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(150);

    const closed = await page.evaluate(() => {
      const header = document.querySelector("header");
      const aside = document.querySelector("aside");
      const trigger = document.querySelector("[aria-label='Open navigation']");
      const drawer = document.querySelector("[data-mobile-nav-root='true']");
      const asideBox = aside?.getBoundingClientRect();
      const triggerBox = trigger?.getBoundingClientRect();
      return {
        headerH: header?.getBoundingClientRect().height ?? 0,
        triggerVisible: Boolean(triggerBox && triggerBox.width > 0 && triggerBox.height > 0),
        sidebarVisible: Boolean(asideBox && asideBox.width > 0 && asideBox.height > 0),
        drawerPresent: Boolean(drawer),
        bodyOverflow: document.body.style.overflow,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        viewportH: window.innerHeight,
      };
    });

    const drawerMode = width < 1280;
    const row = { viewport: label, mode: drawerMode ? "drawer" : "sidebar", closed, checks: [] };

    if (closed.scrollWidth > closed.clientWidth + 1) {
      row.checks.push("closed-overflow");
      failed += 1;
    }
    if (drawerMode && !closed.triggerVisible) {
      row.checks.push("missing-trigger");
      failed += 1;
    }
    if (drawerMode && closed.sidebarVisible) {
      row.checks.push("sidebar-visible-on-mobile");
      failed += 1;
    }
    if (!drawerMode && !closed.sidebarVisible) {
      row.checks.push("missing-sidebar");
      failed += 1;
    }
    if (!drawerMode && closed.triggerVisible) {
      row.checks.push("trigger-visible-on-desktop");
      failed += 1;
    }

    if (drawerMode) {
      await page.getByRole("button", { name: /open navigation/i }).click();
      await page.waitForSelector("[data-mobile-nav-panel='true']");
      const openMetrics = await page.evaluate(() => {
        const root = document.querySelector("[data-mobile-nav-root='true']");
        const panel = document.querySelector("[data-mobile-nav-panel='true']");
        const backdrop = document.querySelector("[data-mobile-nav-backdrop='true']");
        const header = document.querySelector("header");
        const main = document.querySelector("main");
        const rootBox = root.getBoundingClientRect();
        const panelBox = panel.getBoundingClientRect();
        const backdropBox = backdrop.getBoundingClientRect();
        const headerBox = header.getBoundingClientRect();
        const mainBox = main.getBoundingClientRect();
        const links = ["Overview", "API Playground", "API Keys", "Settings"].map((label) => {
          const link = Array.from(panel.querySelectorAll("a")).find((a) =>
            a.textContent?.includes(label),
          );
          const box = link?.getBoundingClientRect();
          return {
            label,
            present: Boolean(link),
            visible: Boolean(box && box.width > 0 && box.height > 0 && box.bottom > 0 && box.top < window.innerHeight),
          };
        });
        return {
          parentIsBody: root.parentElement === document.body,
          bodyOverflow: document.body.style.overflow,
          root: rootBox.toJSON(),
          panel: panelBox.toJSON(),
          backdrop: backdropBox.toJSON(),
          header: headerBox.toJSON(),
          main: mainBox.toJSON(),
          viewport: { w: window.innerWidth, h: window.innerHeight },
          links,
          dialogLabel: panel.getAttribute("aria-labelledby")
            ? document.getElementById(panel.getAttribute("aria-labelledby"))?.textContent
            : null,
        };
      });

      row.open = openMetrics;

      if (!openMetrics.parentIsBody) {
        row.checks.push("drawer-not-on-body");
        failed += 1;
      }
      if (openMetrics.bodyOverflow !== "hidden") {
        row.checks.push("missing-scroll-lock");
        failed += 1;
      }
      if (!almostEqual(openMetrics.root.height, openMetrics.viewport.h, 3)) {
        row.checks.push(`root-height=${openMetrics.root.height}`);
        failed += 1;
      }
      if (!almostEqual(openMetrics.panel.height, openMetrics.viewport.h, 3)) {
        row.checks.push(`panel-height=${openMetrics.panel.height}`);
        failed += 1;
      }
      if (openMetrics.panel.height <= openMetrics.header.height + 8) {
        row.checks.push("panel-clipped-to-header");
        failed += 1;
      }
      if (!(openMetrics.panel.bottom > openMetrics.main.top + 40)) {
        row.checks.push("panel-does-not-overlap-main");
        failed += 1;
      }
      if (!almostEqual(openMetrics.backdrop.height, openMetrics.viewport.h, 3)) {
        row.checks.push("backdrop-not-full-height");
        failed += 1;
      }
      for (const link of openMetrics.links) {
        if (!link.present || !link.visible) {
          row.checks.push(`link-missing-${link.label}`);
          failed += 1;
        }
      }

      await page.keyboard.press("Escape");
      await page.waitForTimeout(80);
      const afterEscape = await page.evaluate(() => ({
        present: Boolean(document.querySelector("[data-mobile-nav-root='true']")),
        overflow: document.body.style.overflow,
      }));
      if (afterEscape.present || afterEscape.overflow === "hidden") {
        row.checks.push("escape-failed");
        failed += 1;
      }

      await page.getByRole("button", { name: /open navigation/i }).click();
      await page.waitForSelector("[data-mobile-nav-panel='true']");
      await page.locator("[data-mobile-nav-backdrop='true']").click({
        position: { x: Math.max(width - 16, 280), y: 40 },
      });
      await page.waitForTimeout(80);
      const afterBackdrop = await page.evaluate(() =>
        Boolean(document.querySelector("[data-mobile-nav-root='true']")),
      );
      if (afterBackdrop) {
        row.checks.push("backdrop-close-failed");
        failed += 1;
      }

      await page.getByRole("button", { name: /open navigation/i }).click();
      await page.waitForSelector("[data-mobile-nav-panel='true']");
      await page.getByRole("dialog").getByRole("link", { name: /api keys/i }).click();
      await page.waitForURL(/\/api-keys/);
      await page.waitForTimeout(80);
      const afterNav = await page.evaluate(() =>
        Boolean(document.querySelector("[data-mobile-nav-root='true']")),
      );
      if (afterNav) {
        row.checks.push("nav-close-failed");
        failed += 1;
      }
    }

    results.push(row);
  }

  for (const shot of shotCases) {
    await page.setViewportSize({ width: shot.width, height: shot.height });
    await page.goto(`${base}/overview`, { waitUntil: "domcontentloaded" });
    if (shot.open && shot.width < 1280) {
      await page.getByRole("button", { name: /open navigation/i }).click();
      await page.waitForSelector("[data-mobile-nav-panel='true']");
    }
    const file = path.join(outDir, `${shot.label}.png`);
    await page.screenshot({ path: file, fullPage: false });
    results.push({ screenshot: file, ...shot });
  }

  // zoom checks on a drawer width
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/overview`, { waitUntil: "domcontentloaded" });
  for (const zoom of ["125%", "150%", "200%"]) {
    await page.evaluate((z) => {
      document.documentElement.style.zoom = z;
    }, zoom);
    await page.getByRole("button", { name: /open navigation/i }).click();
    await page.waitForSelector("[data-mobile-nav-panel='true']");
    const metrics = await page.evaluate(() => {
      const panel = document.querySelector("[data-mobile-nav-panel='true']").getBoundingClientRect();
      return {
        panelH: panel.height,
        viewportH: window.innerHeight,
        parentIsBody:
          document.querySelector("[data-mobile-nav-root='true']").parentElement === document.body,
      };
    });
    if (!metrics.parentIsBody || metrics.panelH <= 100) {
      failed += 1;
      results.push({ zoom, bad: true, metrics });
    } else {
      results.push({ zoom, ok: true, metrics });
    }
    await page.keyboard.press("Escape");
    await page.evaluate(() => {
      document.documentElement.style.zoom = "100%";
    });
  }

  await browser.close();
  const report = path.join(outDir, "report.json");
  fs.writeFileSync(report, JSON.stringify({ base, project, failed, results }, null, 2));
  console.log(JSON.stringify({ report, failed, outDir }, null, 2));
  if (failed) process.exitCode = 1;
} finally {
  try {
    compose(["down"], true);
  } catch (error) {
    console.error(String(error));
  }
}
