import { ProviderError, isRetryableStatus } from '../errors.js';
import { normalizeItems } from '../normalize.js';
import { createApifyQuota } from '../apifyQuota.js';

export function fillTemplate(node, vars) {
  if (typeof node === 'string') {
    if (node === '{{LIMIT}}') return vars.limit;
    return node.replaceAll('{{PAGE_URL}}', vars.pageUrl);
  }
  if (Array.isArray(node)) return node.map((n) => fillTemplate(n, vars));
  if (node && typeof node === 'object') {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, fillTemplate(v, vars)]));
  }
  return node;
}

export function buildApifyRunUrl(cfg) {
  const u = new URL(
    `${cfg.baseUrl}/v2/acts/${encodeURIComponent(cfg.actor)}/run-sync-get-dataset-items`,
  );
  u.searchParams.set('format', 'json');
  u.searchParams.set('clean', 'true');
  if (cfg.maxChargeUsdPerRun != null) {
    u.searchParams.set('maxTotalChargeUsd', String(cfg.maxChargeUsdPerRun));
  }
  return u.toString();
}

export function createApifyProvider(config, { quota } = {}) {
  const cfg = config.apify;
  const quotaManager = quota || createApifyQuota({
    stateDir: config.cacheDir,
    dailyLimit: cfg.dailyRunLimit,
  });

  async function fetchRaw(ref, limit) {
    const reservation = await quotaManager.reserve();
    if (!reservation.ok) {
      throw new ProviderError('apify daily run budget exhausted', {
        retryable: false,
        status: 429,
      });
    }

    const url = buildApifyRunUrl(cfg);
    const input = fillTemplate(cfg.input, { pageUrl: ref.url, limit });

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.token}` },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(cfg.timeoutMs),
      });
    } catch (err) {
      throw new ProviderError(`apify network/timeout error: ${err.name}`, { retryable: true });
    }

    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 200);
      const hint = res.status === 402 ? ' (Apify credits exhausted?)' : res.status === 401 ? ' (invalid APIFY_TOKEN?)' : '';
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
    name: 'apify',
    supports: () => Boolean(cfg.token),
    quota: quotaManager,
    fetchRaw,
    async fetch(ref, limit) {
      return normalizeItems(await fetchRaw(ref, limit), ref, limit);
    },
  };
}
