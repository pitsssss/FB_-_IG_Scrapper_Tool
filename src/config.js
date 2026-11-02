import { parsePageRef } from './pageRef.js';

const toInt = (v, d) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : d;
};
const toList = (v) => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const DEFAULT_APIFY_INPUT = '{"startUrls":[{"url":"{{PAGE_URL}}"}],"resultsLimit":"{{LIMIT}}"}';
export const WARM_CONCURRENCY_MAX = 8;

/**
 * Parse API_KEYS. Rejects duplicate names and duplicate secret values.
 * Note: page authorization uses parsePageRef() canonical keys (slug OR numeric id).
 * A slug and a numeric id for the "same" Facebook page are NOT treated as equivalent
 * unless both appear explicitly in a client's scope list.
 */
export function parseApiKeys(raw) {
  const apiKeys = toList(raw).map((entry) => {
    const i = entry.indexOf(':');
    if (i <= 0 || i === entry.length - 1) {
      throw new Error('API_KEYS entries must be name:secret (non-empty name and secret)');
    }
    return { name: entry.slice(0, i), key: entry.slice(i + 1) };
  });
  const names = new Set();
  const secrets = new Set();
  for (const k of apiKeys) {
    if (names.has(k.name)) throw new Error(`API_KEYS duplicate client name "${k.name}"`);
    if (secrets.has(k.key)) throw new Error('API_KEYS duplicate secret values are not allowed');
    names.add(k.name);
    secrets.add(k.key);
  }
  return apiKeys;
}

/**
 * Optional per-client page scopes. Absent/empty => backward-compatible unscoped mode.
 * When present, every configured API key name must have an explicit array entry.
 */
export function parseApiKeyPageScopes(raw, apiKeys) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  let obj;
  try {
    obj = JSON.parse(String(raw));
  } catch {
    throw new Error('API_KEY_PAGE_SCOPES must be valid JSON object');
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('API_KEY_PAGE_SCOPES must be a JSON object of clientName -> page URL array');
  }

  const keyNames = new Set(apiKeys.map((k) => k.name));
  for (const name of keyNames) {
    if (!Object.prototype.hasOwnProperty.call(obj, name)) {
      throw new Error(`API_KEY_PAGE_SCOPES missing entry for API key "${name}"`);
    }
  }
  for (const name of Object.keys(obj)) {
    if (!keyNames.has(name)) {
      throw new Error(`API_KEY_PAGE_SCOPES unknown API key name "${name}"`);
    }
  }

  const scopes = new Map();
  for (const [name, urls] of Object.entries(obj)) {
    if (!Array.isArray(urls)) {
      throw new Error(`API_KEY_PAGE_SCOPES["${name}"] must be an array of Facebook page URLs`);
    }
    const keys = new Set();
    for (const url of urls) {
      if (typeof url !== 'string' || !url.trim()) {
        throw new Error(`API_KEY_PAGE_SCOPES["${name}"] contains an invalid entry`);
      }
      if (url.includes('*')) {
        throw new Error('API_KEY_PAGE_SCOPES does not support wildcards');
      }
      const ref = parsePageRef(url.trim());
      if (!ref) {
        throw new Error(`API_KEY_PAGE_SCOPES["${name}"] has unsupported page URL`);
      }
      keys.add(ref.key);
    }
    scopes.set(name, keys);
  }
  return scopes;
}

/** Non-negative integer; empty/undefined -> default. Invalid -> throw. */
function requireNonNegInt(raw, name, defaultValue) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return defaultValue;
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) throw new Error(`${name} must be a non-negative integer`);
  return Number.parseInt(s, 10);
}

/** Positive integer >= 1; empty -> default. */
function requirePositiveInt(raw, name, defaultValue, max) {
  const n = requireNonNegInt(raw, name, defaultValue);
  if (n < 1) throw new Error(`${name} must be a positive integer`);
  if (max !== undefined && n > max) throw new Error(`${name} must be <= ${max}`);
  return n;
}

/** Optional finite positive decimal; empty -> null. */
function requireOptionalPositiveDecimal(raw, name) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const s = String(raw).trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`${name} must be a finite positive decimal`);
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a finite positive decimal`);
  return n;
}

export function loadConfig(env = process.env) {
  const apiKeys = parseApiKeys(env.API_KEYS);
  const pageScopes = parseApiKeyPageScopes(env.API_KEY_PAGE_SCOPES, apiKeys);

  let tokens = {};
  if (env.GRAPH_PAGE_TOKENS) {
    try {
      tokens = JSON.parse(env.GRAPH_PAGE_TOKENS);
    } catch {
      throw new Error('GRAPH_PAGE_TOKENS must be valid JSON, e.g. {"mypage":"EAAB..."}');
    }
  }
  const graphTokens = Object.fromEntries(
    Object.entries(tokens).map(([k, v]) => [k.toLowerCase(), String(v)]),
  );

  let apifyInput;
  try {
    apifyInput = JSON.parse(env.APIFY_INPUT || DEFAULT_APIFY_INPUT);
  } catch {
    throw new Error('APIFY_INPUT must be valid JSON');
  }

  // 12 is an example operational invocation limit, not a guaranteed financial budget.
  const dailyRunLimit = requireNonNegInt(env.APIFY_DAILY_RUN_LIMIT, 'APIFY_DAILY_RUN_LIMIT', 12);
  const maxChargeUsdPerRun = requireOptionalPositiveDecimal(
    env.APIFY_MAX_CHARGE_USD_PER_RUN,
    'APIFY_MAX_CHARGE_USD_PER_RUN',
  );

  const warmIntervalSeconds = requireNonNegInt(env.WARM_INTERVAL_SECONDS, 'WARM_INTERVAL_SECONDS', 3600);
  const warmStartupDelaySeconds = requireNonNegInt(
    env.WARM_STARTUP_DELAY_SECONDS,
    'WARM_STARTUP_DELAY_SECONDS',
    10,
  );
  const warmConcurrency = requirePositiveInt(
    env.WARM_CONCURRENCY,
    'WARM_CONCURRENCY',
    1,
    WARM_CONCURRENCY_MAX,
  );

  return {
    port: toInt(env.PORT, 3000),
    host: env.HOST || '0.0.0.0',
    apiKeys,
    pageScopes,
    allowedPages: toList(env.ALLOWED_PAGES).map((s) => s.toLowerCase()),
    allowedOrigins: toList(env.ALLOWED_ORIGINS),
    rateLimitPerMin: toInt(env.RATE_LIMIT_PER_MIN, 120),
    cacheDir: env.CACHE_DIR || './data/cache',
    freshTtlMs: toInt(env.FRESH_TTL_SECONDS, 21600) * 1000,
    retryCooldownMs: toInt(env.RETRY_COOLDOWN_SECONDS, 300) * 1000,
    maxPosts: Math.max(1, toInt(env.MAX_POSTS, 10)),
    providers: toList(env.PROVIDERS || 'graph,apify').map((s) => s.toLowerCase()),
    retries: toInt(env.UPSTREAM_RETRIES, 2),
    backoffMs: toInt(env.RETRY_BACKOFF_MS, 2000),
    warmPagesRaw: env.WARM_PAGES || '',
    warmIntervalMs: warmIntervalSeconds * 1000,
    warmStartupDelayMs: warmStartupDelaySeconds * 1000,
    warmConcurrency,
    apify: {
      token: env.APIFY_TOKEN || '',
      actor: (env.APIFY_ACTOR || 'apify~facebook-posts-scraper').replace('/', '~'),
      baseUrl: (env.APIFY_BASE_URL || 'https://api.apify.com').replace(/\/+$/, ''),
      input: apifyInput,
      timeoutMs: toInt(env.APIFY_TIMEOUT_MS, 150000),
      dailyRunLimit,
      maxChargeUsdPerRun,
    },
    graph: {
      tokens: graphTokens,
      version: env.GRAPH_VERSION || 'v23.0',
      baseUrl: (env.GRAPH_BASE_URL || 'https://graph.facebook.com').replace(/\/+$/, ''),
      timeoutMs: toInt(env.GRAPH_TIMEOUT_MS, 20000),
    },
  };
}
