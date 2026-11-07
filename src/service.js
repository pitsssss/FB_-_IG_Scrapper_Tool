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
  const cacheGenerations = new Map(); // key -> number (invalidates in-flight writes after delete)

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
    const startGen = cacheGenerations.get(ref.key) || 0;
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
        // Skip disk/memory write if the entry was deleted while this refresh ran.
        if ((cacheGenerations.get(ref.key) || 0) !== startGen) {
          return entry;
        }
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
   * Side-effect-free cache read for admin playground (Cache Only mode).
   * Never schedules background refresh, never reserves quota, never mutates cache.
   */
  async function peekCachedPosts(ref, limit) {
    let entry;
    try {
      entry = await cache.get(ref.key);
    } catch {
      throw new ServiceError(500, 'CACHE_READ_ERROR', 'Could not read cache safely');
    }
    if (!entry) {
      throw new ServiceError(404, 'CACHE_MISS', 'No cached posts for this account');
    }
    const ageMs = Math.max(0, Date.now() - entry.fetchedAt);
    const fresh = ageMs < config.freshTtlMs;
    const source = fresh ? 'cache' : 'stale-cache';
    // Identity resolution without enrichment (no Apify).
    return respond(entry, source, limit, ref);
  }

  /**
   * Explicit admin force-refresh. Always invokes the provider pipeline (subject to
   * single-flight), even when cache is still fresh. Does not change public getPosts.
   */
  async function forceRefresh(ref, limit) {
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

  /**
   * Admin cache delete for one account. Conflicts when a refresh is in flight.
   * Bumps generation so a finishing refresh cannot repopulate the deleted key.
   */
  async function deleteCacheEntry(cacheKey) {
    if (!cacheKey || typeof cacheKey !== 'string') {
      return { ok: false, code: 'INVALID_CACHE_KEY', message: 'Invalid cache key' };
    }
    if (inflight.has(cacheKey)) {
      return {
        ok: false,
        code: 'REFRESH_IN_PROGRESS',
        message: 'A refresh is in progress for this account; retry delete shortly',
      };
    }
    cacheGenerations.set(cacheKey, (cacheGenerations.get(cacheKey) || 0) + 1);
    const result = await cache.delete(cacheKey);
    if (!result.ok) return result;
    failures.delete(cacheKey);
    return result;
  }

  function isRefreshInflight(cacheKey) {
    return inflight.has(cacheKey);
  }

  return {
    getPosts,
    peekCachedPosts,
    forceRefresh,
    warm,
    deleteCacheEntry,
    isRefreshInflight,
    quota,
    cache,
    config,
    providerNames: () => providerList.map((p) => p.name),
    hasProviderFor(ref) {
      return providerList.some((p) => p.supports(ref));
    },
  };
}
