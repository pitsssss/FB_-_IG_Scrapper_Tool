import { Cache } from './cache.js';
import { ProviderError, ServiceError } from './errors.js';
import { buildProviders } from './providers/index.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createService(config, providers = buildProviders(config)) {
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
    const candidates = providers.filter((p) => p.supports(ref));
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

  function refresh(ref) {
    if (inflight.has(ref.key)) return inflight.get(ref.key);
    const promise = (async () => {
      try {
        const result = await fetchFromProviders(ref);
        const entry = { key: ref.key, fetchedAt: Date.now(), provider: result.provider, page: result.page, posts: result.posts };
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

  function respond(entry, source, limit) {
    const ageMs = Math.max(0, Date.now() - entry.fetchedAt);
    const posts = entry.posts.slice(0, limit);
    return {
      success: true,
      data: { page: entry.page, posts },
      meta: {
        source,                                   // "live" | "cache" | "stale-cache"
        provider: entry.provider,
        fetched_at: new Date(entry.fetchedAt).toISOString(),
        cache_age_seconds: Math.round(ageMs / 1000),
        stale: source === 'stale-cache',
        count: posts.length,
        limit,
        warning: source !== 'live' && failures.has(entry.key) ? 'UPSTREAM_REFRESH_FAILED' : null,
      },
    };
  }

  async function getPosts(ref, limit) {
    const entry = await cache.get(ref.key);

    if (entry) {
      if (Date.now() - entry.fetchedAt < config.freshTtlMs) return respond(entry, 'cache', limit);
      // Stale: answer immediately from cache, refresh in the background (unless upstream recently failed).
      if (!coolingDown(ref.key)) refresh(ref).catch(() => {});
      return respond(entry, 'stale-cache', limit);
    }

    if (coolingDown(ref.key)) {
      throw new ServiceError(502, 'UPSTREAM_UNAVAILABLE', 'Upstream recently failed and no cached copy exists; retry later');
    }
    const fresh = await refresh(ref);
    return respond(fresh, 'live', limit);
  }

  return { getPosts };
}
