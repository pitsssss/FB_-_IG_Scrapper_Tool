import { createApifyProvider } from './apify.js';
import { createGraphProvider } from './graph.js';
import { createInstagramApifyProvider } from './instagramApify.js';
import { createApifyQuota } from '../apifyQuota.js';

/**
 * Build provider chain. Facebook Apify + Instagram Apify share ONE durable quota manager
 * (same CACHE_DIR/apify-quota.json) so concurrent FB/IG scrapes cannot overshoot the daily budget.
 */
export function buildProviders(config, { quota } = {}) {
  const sharedQuota = quota || createApifyQuota({
    stateDir: config.cacheDir,
    dailyLimit: config.apify.dailyRunLimit,
  });

  const out = [];
  for (const name of config.providers) {
    if (name === 'apify') {
      out.push(createApifyProvider(config, { quota: sharedQuota }));
      // Instagram uses the same APIFY_TOKEN / daily budget; separate Actor + normalizer.
      out.push(createInstagramApifyProvider(config, { quota: sharedQuota }));
    } else if (name === 'graph') {
      out.push(createGraphProvider(config));
    } else {
      throw new Error(`Unknown provider "${name}". Supported: apify, graph`);
    }
  }
  return out;
}
