import { loadConfig } from './config.js';
import { createApp } from './server.js';
import { createService } from './service.js';
import {
  createCacheWarmer,
  parseWarmPageList,
  parseInstagramWarmProfileList,
} from './cacheWarmer.js';

const config = loadConfig();
const warmFacebook = parseWarmPageList(config.warmPagesRaw, { allowedPages: config.allowedPages });
const warmInstagram = parseInstagramWarmProfileList(config.instagramWarmProfilesRaw, {
  instagramAllowedProfiles: config.instagramAllowedProfiles,
});
const warmPages = [...warmFacebook, ...warmInstagram];
const service = createService(config);
const server = createApp(config, service);
// Activate management hub (encrypted Apify token + managed API keys) without waiting for an admin request.
try {
  server.getHub?.();
} catch (err) {
  console.error('[admin] management hub failed to start:', err?.message || err);
}
let warmer = null;
let shuttingDown = false;

server.listen(config.port, config.host, () => {
  console.log(`fb-posts-api listening on http://${config.host}:${config.port}`);
  console.log(`providers: ${config.providers.join(' -> ')} | fresh TTL: ${config.freshTtlMs / 1000}s | cache dir: ${config.cacheDir}`);
  console.log(`apify daily run limit: ${config.apify.dailyRunLimit} (UTC, shared FB+IG) | maxChargeUsdPerRun: ${config.apify.maxChargeUsdPerRun ?? '(none)'}`);
  console.log(`instagram actor: ${config.instagramApify.actor}`);
  if (!config.apify.token && !Object.keys(config.graph.tokens).length) {
    console.warn('WARNING: neither APIFY_TOKEN nor GRAPH_PAGE_TOKENS is set - only cached pages can be served.');
  }
  console.log('NOTE: filesystem Apify quota is single-process only — run one API replica until a shared quota store exists.');

  if (warmPages.length) {
    warmer = createCacheWarmer({ config, service, pages: warmPages });
    warmer.start();
    console.log(`cache warmer: ${warmPages.length} page(s) (fb=${warmFacebook.length}, ig=${warmInstagram.length}), startup delay ${config.warmStartupDelayMs / 1000}s, interval ${config.warmIntervalMs / 1000}s, concurrency ${config.warmConcurrency}`);
  } else {
    console.log('cache warmer: disabled (WARM_PAGES / INSTAGRAM_WARM_PROFILES empty)');
  }
});

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal}`);
  try {
    if (warmer) await warmer.stop();
  } catch (err) {
    console.error('[shutdown] warmer stop failed:', err?.message || err);
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref?.();
}

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { shutdown(sig); });
}
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err));
