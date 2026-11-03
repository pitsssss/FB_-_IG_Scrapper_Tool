import { ProviderError, isRetryableStatus } from '../errors.js';
import { normalizeInstagramItems } from '../instagramNormalize.js';
import { isInstagramRef } from '../instagramRef.js';
import { buildApifyRunUrl } from './apify.js';
import { createApifyQuota } from '../apifyQuota.js';

/**
 * Official Actor input (verified from Apify docs):
 * - username: string[]
 * - resultsLimit: integer
 * - skipPinnedPosts: boolean
 * - dataDetailLevel: "basicData" | "detailedData"  (detailed is paid extra — we use basicData)
 * Avoid includeMusicData (paid add-on).
 */
export function buildInstagramApifyInput(ref, limit, template) {
  const base = template && typeof template === 'object'
    ? JSON.parse(JSON.stringify(template))
    : {};
  base.username = [ref.username || ref.url];
  base.resultsLimit = limit;
  if (base.skipPinnedPosts === undefined) base.skipPinnedPosts = false;
  if (!base.dataDetailLevel) base.dataDetailLevel = 'basicData';
  // Never enable paid music add-on by default.
  if (base.includeMusicData === undefined) base.includeMusicData = false;
  return base;
}

/**
 * Instagram posts via apify/instagram-post-scraper.
 * MUST receive the same quota manager instance as the Facebook Apify provider.
 */
export function createInstagramApifyProvider(config, { quota } = {}) {
  const fbCfg = config.apify;
  const igCfg = config.instagramApify || {};
  const token = fbCfg.token || '';
  const actor = (igCfg.actor || 'apify~instagram-post-scraper').replace('/', '~');
  const runCfg = {
    baseUrl: fbCfg.baseUrl,
    actor,
    maxChargeUsdPerRun: fbCfg.maxChargeUsdPerRun,
  };
  const timeoutMs = igCfg.timeoutMs || fbCfg.timeoutMs || 150000;
  const inputTemplate = igCfg.input || {
    username: [],
    resultsLimit: 10,
    skipPinnedPosts: false,
    dataDetailLevel: 'basicData',
    includeMusicData: false,
  };

  const quotaManager = quota || createApifyQuota({
    stateDir: config.cacheDir,
    dailyLimit: fbCfg.dailyRunLimit,
  });

  async function fetchRaw(ref, limit) {
    const reservation = await quotaManager.reserve();
    if (!reservation.ok) {
      throw new ProviderError('apify daily run budget exhausted', {
        retryable: false,
        status: 429,
      });
    }

    const url = buildApifyRunUrl(runCfg);
    const input = buildInstagramApifyInput(ref, limit, inputTemplate);

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new ProviderError(`apify network/timeout error: ${err.name}`, { retryable: true });
    }

    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 200);
      const hint = res.status === 402 ? ' (Apify credits exhausted?)'
        : res.status === 401 ? ' (invalid APIFY_TOKEN?)'
          : res.status === 403 ? ' (forbidden)'
            : '';
      throw new ProviderError(`apify HTTP ${res.status}${hint}: ${body}`, {
        retryable: isRetryableStatus(res.status),
        status: res.status,
      });
    }

    let items;
    try {
      items = await res.json();
    } catch {
      throw new ProviderError('apify returned invalid JSON', { retryable: true });
    }
    if (!Array.isArray(items)) throw new ProviderError('apify returned an unexpected payload', { retryable: true });
    return items;
  }

  return {
    name: 'instagram-apify',
    supports: (ref) => Boolean(token) && isInstagramRef(ref),
    quota: quotaManager,
    fetchRaw,
    async fetch(ref, limit) {
      return normalizeInstagramItems(await fetchRaw(ref, limit), ref, limit);
    },
  };
}
