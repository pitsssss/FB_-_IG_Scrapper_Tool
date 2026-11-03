import { parsePageRef } from './pageRef.js';
import { parseInstagramRef } from './instagramRef.js';

const toList = (v) => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/**
 * Parse and validate WARM_PAGES. Deduplicates by normalized page key.
 * Throws on invalid URLs or pages outside ALLOWED_PAGES.
 */
export function parseWarmPageList(raw, { allowedPages = [] } = {}) {
  const urls = toList(raw);
  if (!urls.length) return [];
  const seen = new Set();
  const refs = [];
  for (const url of urls) {
    const ref = parsePageRef(url);
    if (!ref) {
      throw new Error(`WARM_PAGES contains an invalid Facebook page URL: ${url}`);
    }
    if (allowedPages.length && !allowedPages.includes(ref.key)) {
      throw new Error(`WARM_PAGES page "${ref.key}" is not in ALLOWED_PAGES`);
    }
    if (seen.has(ref.key)) continue;
    seen.add(ref.key);
    refs.push(ref);
  }
  return refs;
}

/**
 * Parse INSTAGRAM_WARM_PROFILES. Deduplicates by `instagram:<user>` key.
 */
export function parseInstagramWarmProfileList(raw, { instagramAllowedProfiles = [] } = {}) {
  const urls = toList(raw);
  if (!urls.length) return [];
  const seen = new Set();
  const refs = [];
  for (const url of urls) {
    const ref = parseInstagramRef(url) || (/^[A-Za-z0-9._]{1,30}$/.test(url)
      ? parseInstagramRef(`https://www.instagram.com/${url}/`)
      : null);
    if (!ref) {
      throw new Error(`INSTAGRAM_WARM_PROFILES contains an invalid Instagram profile URL: ${url}`);
    }
    if (instagramAllowedProfiles.length && !instagramAllowedProfiles.includes(ref.key)) {
      throw new Error(`INSTAGRAM_WARM_PROFILES profile "${ref.key}" is not in INSTAGRAM_ALLOWED_PROFILES`);
    }
    if (seen.has(ref.key)) continue;
    seen.add(ref.key);
    refs.push(ref);
  }
  return refs;
}

/**
 * Background cache warmer. Uses the shared service refresh path (quota, cooldown,
 * single-flight, never-overwrite-empty). Does not touch HTTP auth/CORS/rate limits.
 * May include Facebook and/or Instagram refs.
 */
export function createCacheWarmer({
  config,
  service,
  pages,
  log = (msg) => console.log(msg),
  warn = (msg) => console.error(msg),
} = {}) {
  if (!service || typeof service.warm !== 'function') {
    throw new Error('createCacheWarmer: service.warm is required');
  }
  const list = Array.isArray(pages) ? pages : [];
  const concurrency = Math.max(1, config.warmConcurrency || 1);

  let stopped = false;
  let cycleRunning = false;
  let startupTimer = null;
  let intervalTimer = null;
  let activeCycle = Promise.resolve();

  async function runCycle(label = 'cycle') {
    if (stopped || cycleRunning || !list.length) return { ran: false, results: [] };
    cycleRunning = true;
    const results = [];
    try {
      const queue = [...list];
      const worker = async () => {
        while (!stopped) {
          const ref = queue.shift();
          if (!ref) return;
          try {
            const outcome = await service.warm(ref);
            results.push(outcome);
            log(`[warm] ${label} ${ref.key}: ${outcome.outcome}`);
          } catch (err) {
            const message = err?.message || String(err);
            results.push({ key: ref.key, outcome: 'failed', error: message });
            warn(`[warm] ${label} ${ref.key}: unexpected error: ${message}`);
          }
        }
      };
      const n = Math.min(concurrency, list.length);
      await Promise.all(Array.from({ length: n }, () => worker()));
      return { ran: true, results };
    } finally {
      cycleRunning = false;
    }
  }

  function armInterval() {
    if (stopped || !config.warmIntervalMs) return;
    intervalTimer = setTimeout(() => {
      activeCycle = runCycle('periodic').then(() => {
        armInterval();
      }).catch((err) => {
        warn(`[warm] periodic cycle error: ${err?.message || err}`);
        armInterval();
      });
    }, config.warmIntervalMs);
  }

  function start() {
    if (!list.length || stopped) return;
    startupTimer = setTimeout(() => {
      activeCycle = runCycle('startup').then(() => {
        armInterval();
      }).catch((err) => {
        warn(`[warm] startup cycle error: ${err?.message || err}`);
        armInterval();
      });
    }, config.warmStartupDelayMs || 0);
  }

  async function stop() {
    stopped = true;
    if (startupTimer) clearTimeout(startupTimer);
    if (intervalTimer) clearTimeout(intervalTimer);
    startupTimer = null;
    intervalTimer = null;
    try { await activeCycle; } catch { /* ignore */ }
  }

  return {
    start,
    stop,
    /** Test helper: run one cycle immediately (still respects overlap guard). */
    runCycle,
    get running() { return cycleRunning; },
    get stopped() { return stopped; },
    get pageCount() { return list.length; },
  };
}
