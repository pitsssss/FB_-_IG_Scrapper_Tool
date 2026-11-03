import { Cache } from './cache.js';
import { ProviderError, ServiceError } from './errors.js';
import { buildProviders } from './providers/index.js';
import { createApifyQuota } from './apifyQuota.js';
import { createInstagramIdentity } from './instagramIdentity.js';
import { isInstagramRef } from './instagramRef.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createService(config, providers) {
  const sharedQuota = createApifyQuota({
    stateDir: config.cacheDir,
    dailyLimit: config.apify.dailyRunLimit,
  });
  const providerList = providers || buildProviders(config, { quota: sharedQuota });
  const quota = providerList.find((p) => p.quota)?.quota || sharedQuota;
  const igIdentity = createInstagramIdentity(config, { quota });
  const cache = new Cache(config.cacheDir);
  const inflight = new Map();   // key -> Promise  (one upstream call per page at a time)
  const failures = new Map();   // key -> { at, message }

  const coolingDown = (key) => {
    const f = failures.get(key);
    return Boolean(f) && Date.now() - f.at < config.retryCooldownMs;
  };

  async function withRetry(fn) {
    let lastErr;
    for (let attempt = 0; attempt <= config.retries; attempt += 1) {
      try {
        const result = await fn();
        if (!result.posts.length) throw new ProviderError('provider returned 0 posts', { retryable: true });
        return result;
      } catch (err) {
        lastErr = err;
        if (err instanceof ProviderError && err.retryable === false) break;
        if (attempt < config.retries) await sleep(config.backoffMs * 3 ** attempt);
      }
    }
    throw lastErr;
  }

  async function fetchFromProviders(ref) {
    const candidates = providerList.filter((p) => p.supports(ref));
    if (!candidates.length) {
      throw new ServiceError(503, 'NO_PROVIDER_CONFIGURED', 'No upstream provider is configured for this page');
    }
    const errors = [];
    for (const provider of candidates) {
      try {
        const result = await withRetry(() => provider.fetch(ref, config.maxPosts));
        return { provider: provider.name, ...result };
      } catch (err) {
        errors.push(`${provider.name}: ${err.message}`);
        console.error(`[upstream] ${provider.name} failed for "${ref.key}": ${err.message}`);
      }
    }
    throw new ServiceError(502, 'UPSTREAM_UNAVAILABLE', 'Could not fetch posts from any provider and no cached copy exists');
  }

  /**
   * Apply Instagram logo priority at response time without rewriting post cache on disk.
   * allowEnrichment=true only on live refresh paths (may consume one shared Apify reservation).
   */
  async function withInstagramIdentity(entry, ref, { allowEnrichment = false } = {}) {
    if (!isInstagramRef(ref)) return entry;
    try {
      const page = await igIdentity.resolvePage(entry.page, ref, { allowEnrichment });
      const posts = igIdentity.attachPageToPosts(page, entry.posts);
      return { ...entry, page, posts };
    } catch (err) {
      console.error(`[instagram-identity] resolve failed for "${ref.key}": ${err.message}`);
      return entry;
    }
  }

  function refresh(ref) {
    if (inflight.has(ref.key)) return inflight.get(ref.key);
    const promise = (async () => {
      try {
        const result = await fetchFromProviders(ref);
        let entry = {
          key: ref.key,
          fetchedAt: Date.now(),
          provider: result.provider,
          page: result.page,
          posts: result.posts,
        };
        // Enrichment may run once here; post cache is written with resolved page when possible.
        entry = await withInstagramIdentity(entry, ref, { allowEnrichment: true });
        await cache.set(ref.key, entry); // only ever called with a NON-EMPTY result
        failures.delete(ref.key);
        return entry;
      } catch (err) {
        failures.set(ref.key, { at: Date.now(), message: err.message });
        throw err;
      } finally {
        inflight.delete(ref.key);
      }
    })();
    inflight.set(ref.key, promise);
    return promise;
  }

  async function respond(entry, source, limit, ref) {
    const resolved = await withInstagramIdentity(entry, ref, { allowEnrichment: false });
    const ageMs = Math.max(0, Date.now() - resolved.fetchedAt);
    const posts = resolved.posts.slice(0, limit);
    return {
      success: true,
      data: { page: resolved.page, posts },
      meta: {
        source,                                   // "live" | "cache" | "stale-cache"
        provider: resolved.provider,
        fetched_at: new Date(resolved.fetchedAt).toISOString(),
        cache_age_seconds: Math.round(ageMs / 1000),
        stale: source === 'stale-cache',
        count: posts.length,
        limit,
        warning: source !== 'live' && failures.has(resolved.key) ? 'UPSTREAM_REFRESH_FAILED' : null,
      },
    };
  }

  async function getPosts(ref, limit) {
    const entry = await cache.get(ref.key);

    if (entry) {
      if (Date.now() - entry.fetchedAt < config.freshTtlMs) return respond(entry, 'cache', limit, ref);
      // Stale: answer immediately from cache, refresh in the background (unless upstream recently failed).
      if (!coolingDown(ref.key)) refresh(ref).catch(() => {});
      return respond(entry, 'stale-cache', limit, ref);
    }

    if (coolingDown(ref.key)) {
      throw new ServiceError(502, 'UPSTREAM_UNAVAILABLE', 'Upstream recently failed and no cached copy exists; retry later');
    }
    const fresh = await refresh(ref);
    return respond(fresh, 'live', limit, ref);
  }

  /**
   * Internal cache warming entrypoint (not HTTP). Skips fresh entries and cooldown;
   * reuses single-flight refresh; never clears existing cache on failure.
   */
  async function warm(ref) {
    const entry = await cache.get(ref.key);
    if (entry && Date.now() - entry.fetchedAt < config.freshTtlMs) {
      return { key: ref.key, outcome: 'skipped-fresh' };
    }
    if (coolingDown(ref.key)) {
      return { key: ref.key, outcome: 'skipped-cooldown' };
    }
    try {
      await refresh(ref);
      return { key: ref.key, outcome: 'refreshed' };
    } catch (err) {
      return { key: ref.key, outcome: 'failed', error: err?.message || String(err) };
    }
  }

  return { getPosts, warm };
}
