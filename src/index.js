import { loadConfig } from './config.js';
import { createApp } from './server.js';
import { createService } from './service.js';
import {
  createCacheWarmer,
  parseWarmPageList,
  parseInstagramWarmProfileList,
} from './cacheWarmer.js';

const config = loadConfig();
const service = createService(config);
const server = createApp(config, service);
// Activate management hub early so settings overrides apply before warmer start.
let hub = null;
try {
  hub = server.getHub?.() || null;
  hub?.settings?.applyToRuntime?.();
} catch (err) {
  console.error('[admin] management hub failed to start:', err?.message || err);
}
let warmer = null;
let shuttingDown = false;

function resolveWarmPages() {
  const warmCfg = hub?.settings?.resolvedWarmConfig?.();
  if (warmCfg) {
    if (!warmCfg.enabled) return { pages: [], facebook: [], instagram: [], warmCfg };
    const facebook = parseWarmPageList(warmCfg.facebook.join(','), {
      allowedPages: config.allowedPages,
    });
    const instagram = parseInstagramWarmProfileList(warmCfg.instagram.join(','), {
      instagramAllowedProfiles: config.instagramAllowedProfiles,
    });
    if (Number.isInteger(warmCfg.intervalSeconds)) {
      config.warmIntervalMs = warmCfg.intervalSeconds * 1000;
    }
    if (Number.isInteger(warmCfg.concurrency)) {
      config.warmConcurrency = warmCfg.concurrency;
    }
    return { pages: [...facebook, ...instagram], facebook, instagram, warmCfg };
  }
  const facebook = parseWarmPageList(config.warmPagesRaw, { allowedPages: config.allowedPages });
  const instagram = parseInstagramWarmProfileList(config.instagramWarmProfilesRaw, {
    instagramAllowedProfiles: config.instagramAllowedProfiles,
  });
  return { pages: [...facebook, ...instagram], facebook, instagram, warmCfg: null };
}

server.listen(config.port, config.host, () => {
  console.log(`fb-posts-api listening on http://${config.host}:${config.port}`);
  console.log(`providers: ${config.providers.join(' -> ')} | fresh TTL: ${config.freshTtlMs / 1000}s | cache dir: ${config.cacheDir}`);
  console.log(`apify daily run limit: ${config.apify.dailyRunLimit} (UTC, shared FB+IG) | maxChargeUsdPerRun: ${config.apify.maxChargeUsdPerRun ?? '(none)'}`);
  console.log(`instagram actor: ${config.instagramApify.actor}`);
  if (!config.apify.token && !Object.keys(config.graph.tokens).length) {
    console.warn('WARNING: neither APIFY_TOKEN nor GRAPH_PAGE_TOKENS is set - only cached pages can be served.');
  }
  console.log('NOTE: filesystem Apify quota is single-process only — run one API replica until a shared quota store exists.');

  try {
    const { pages, facebook, instagram, warmCfg } = resolveWarmPages();
    if (pages.length && (warmCfg ? warmCfg.enabled : true)) {
      warmer = createCacheWarmer({ config, service, pages });
      warmer.start();
      console.log(`cache warmer: ${pages.length} page(s) (fb=${facebook.length}, ig=${instagram.length}), startup delay ${config.warmStartupDelayMs / 1000}s, interval ${config.warmIntervalMs / 1000}s, concurrency ${config.warmConcurrency}`);
      if (warmCfg) {
        console.log('cache warmer: lists loaded from managed settings + env (restart required after dashboard warm changes)');
      }
    } else {
      console.log('cache warmer: disabled (empty warm lists or warm_enabled=false)');
    }
  } catch (err) {
    console.error('[warm] failed to start warmer:', err?.message || err);
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
