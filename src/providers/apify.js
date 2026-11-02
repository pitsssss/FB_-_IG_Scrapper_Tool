import { ProviderError, isRetryableStatus } from '../errors.js';
import { normalizeItems } from '../normalize.js';

function fillTemplate(node, vars) {
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

export function createApifyProvider(config) {
  const cfg = config.apify;
  return {
    name: 'apify',
    supports: () => Boolean(cfg.token),

    async fetch(ref, limit) {
      const url = `${cfg.baseUrl}/v2/acts/${encodeURIComponent(cfg.actor)}/run-sync-get-dataset-items?format=json&clean=true`;
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
      return normalizeItems(items, ref, limit);
    },
  };
}
