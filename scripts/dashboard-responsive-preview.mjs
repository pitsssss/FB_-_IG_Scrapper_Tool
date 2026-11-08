import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const base = process.env.DASHBOARD_PREVIEW_URL || "http://127.0.0.1:8080";
const outDir = path.join(os.tmpdir(), "smp-ui-review");
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
const routes = ["/login", "/setup", "/overview", "/playground", "/docs"];
const shots = new Set([
  "320x667",
  "390x844",
  "768x1024",
  "1024x768",
  "1280x720",
  "1440x900",
  "1920x1080",
]);

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];

for (const [width, height] of viewports) {
  const label = `${width}x${height}`;
  const page = await browser.newPage({ viewport: { width, height } });
  for (const route of routes) {
    const response = await page.goto(`${base}${route}`, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(250);
    const metrics = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      path: location.pathname,
      title: document.title,
      hasDialog: Boolean(document.querySelector("[role=dialog]")),
      hamburger: Boolean(document.querySelector("[aria-label='Open navigation']")),
      sidebar: Boolean(document.querySelector("aside")),
    }));
    const overflow = metrics.scrollWidth > metrics.clientWidth + 1;
    let drawer = null;
    if (metrics.hamburger) {
      await page.getByRole("button", { name: /open navigation/i }).click();
      drawer = await page.evaluate(() => ({
        open: Boolean(document.querySelector("[role=dialog]")),
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      await page.keyboard.press("Escape");
      await page.waitForTimeout(100);
    }
    const row = {
      viewport: label,
      route,
      status: response?.status() ?? 0,
      overflow,
      drawerOverflow: drawer ? drawer.scrollWidth > drawer.clientWidth + 1 : null,
      ...metrics,
      drawerOpened: drawer?.open ?? null,
    };
    results.push(row);
    if (shots.has(label) && (route === "/login" || route === "/overview")) {
      const file = path.join(outDir, `${label}-${metrics.path.replace(/\//g, "") || "root"}.png`);
      await page.screenshot({ path: file, fullPage: true });
      row.screenshot = file;
    }
  }
  await page.close();
}

const zoomPage = await browser.newPage({ viewport: { width: 1366, height: 768 } });
const zooms = [];
for (const zoom of ["100%", "125%", "150%", "200%"]) {
  await zoomPage.goto(`${base}/login`, { waitUntil: "networkidle" });
  await zoomPage.evaluate((z) => {
    document.documentElement.style.zoom = z;
  }, zoom);
  await zoomPage.waitForTimeout(100);
  const m = await zoomPage.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  zooms.push({ zoom, overflow: m.scrollWidth > m.clientWidth + 1, ...m });
}
await zoomPage.close();
await browser.close();

await mkdir(outDir, { recursive: true });
const reportPath = path.join(outDir, "report.json");
await writeFile(reportPath, JSON.stringify({ base, results, zooms }, null, 2));
const bad = results.filter((r) => r.overflow || r.drawerOverflow || r.status >= 500);
console.log(JSON.stringify({ reportPath, outDir, failures: bad.length, zooms, sample: results.filter((r) => r.screenshot) }, null, 2));
if (bad.length) {
  console.log(JSON.stringify(bad, null, 2));
  process.exitCode = 1;
}
