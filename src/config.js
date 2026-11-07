import { parseFacebookConfigRef, parseFacebookUsername } from './pageRef.js';
import { parseInstagramConfigRef } from './instagramRef.js';
import { parseInstagramProfileLogos } from './instagramLogo.js';

const toInt = (v, d) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : d;
};
const toList = (v) => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const DEFAULT_APIFY_INPUT = '{"startUrls":[{"url":"{{PAGE_URL}}"}],"resultsLimit":"{{LIMIT}}"}';
const DEFAULT_INSTAGRAM_APIFY_INPUT = JSON.stringify({
  username: [],
  resultsLimit: 10,
  // Newest accessible NON-PINNED posts (pinned-but-recent may be excluded).
  skipPinnedPosts: true,
  dataDetailLevel: 'basicData',
  includeMusicData: false,
});
export const WARM_CONCURRENCY_MAX = 8;

/**
 * Parse API_KEYS. Rejects duplicate names and duplicate secret values.
 * Note: page authorization uses canonical cache keys from username/config parsers.
 * Facebook slug and numeric id for the "same" page are NOT auto-equated.
 * Instagram keys are always `instagram:<username>` (never collide with Facebook).
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
 * Resolve a trusted scope entry to a cache key (Facebook or Instagram).
 * Accepted forms (config only — NOT public API):
 * - facebook:<username> / bare Facebook username
 * - instagram:<username>
 * - legacy Facebook/Instagram profile URLs
 * Bare names without a platform prefix resolve as Facebook usernames
 * (use `instagram:<user>` for Instagram to avoid cross-platform ambiguity).
 */
export function parseScopeRef(entry) {
  if (typeof entry !== 'string' || !entry.trim()) return null;
  const raw = entry.trim();
  if (/^instagram:/i.test(raw)) return parseInstagramConfigRef(raw);
  if (/^facebook:/i.test(raw)) return parseFacebookConfigRef(raw);
  return parseFacebookConfigRef(raw) || parseInstagramConfigRef(raw);
}

/**
 * Optional per-client page scopes. Absent/empty => backward-compatible unscoped mode.
 * When present, every configured API key name must have an explicit array entry.
 * Entries may be usernames, platform-prefixed ids, and/or legacy profile URLs.
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
    throw new Error('API_KEY_PAGE_SCOPES must be a JSON object of clientName -> username/URL array');
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
      throw new Error(`API_KEY_PAGE_SCOPES["${name}"] must be an array of Facebook/Instagram usernames or URLs`);
    }
    const keys = new Set();
    for (const url of urls) {
      if (typeof url !== 'string' || !url.trim()) {
        throw new Error(`API_KEY_PAGE_SCOPES["${name}"] contains an invalid entry`);
      }
      if (url.includes('*')) {
        throw new Error('API_KEY_PAGE_SCOPES does not support wildcards');
      }
      const ref = parseScopeRef(url.trim());
      if (!ref) {
        throw new Error(`API_KEY_PAGE_SCOPES["${name}"] has unsupported page/profile reference`);
      }
      keys.add(ref.key);
    }
    scopes.set(name, keys);
  }
  return scopes;
}

/** Parse INSTAGRAM_ALLOWED_PROFILES → Set of cache keys `instagram:user`. */
export function parseInstagramAllowedProfiles(raw) {
  const urls = toList(raw);
  const keys = [];
  for (const url of urls) {
    const ref = parseInstagramConfigRef(url);
    if (!ref) {
      throw new Error(`INSTAGRAM_ALLOWED_PROFILES contains an invalid Instagram profile: ${url}`);
    }
    keys.push(ref.key);
  }
  return keys;
}

/** Parse ALLOWED_PAGES → Facebook cache keys (usernames / legacy URLs). */
export function parseAllowedPages(raw) {
  const items = toList(raw);
  const keys = [];
  for (const item of items) {
    const ref = parseFacebookConfigRef(item) || parseFacebookUsername(item);
    if (!ref) {
      throw new Error(`ALLOWED_PAGES contains an invalid Facebook page username: ${item}`);
    }
    keys.push(ref.key);
  }
  return keys;
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

  let instagramApifyInput;
  try {
    instagramApifyInput = JSON.parse(env.INSTAGRAM_APIFY_INPUT || DEFAULT_INSTAGRAM_APIFY_INPUT);
  } catch {
    throw new Error('INSTAGRAM_APIFY_INPUT must be valid JSON');
  }

  // 12 is an example operational invocation limit, not a guaranteed financial budget.
  // Shared across Facebook + Instagram Apify Actors.
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

  const instagramProfileLogos = parseInstagramProfileLogos(env.INSTAGRAM_PROFILE_LOGOS);
  const enrichmentRaw = String(env.INSTAGRAM_PROFILE_ENRICHMENT || '').trim().toLowerCase();
  const instagramProfileEnrichmentEnabled =
    enrichmentRaw === '1' || enrichmentRaw === 'true' || enrichmentRaw === 'yes';
  // Default 7 days. Profile metadata is separate from post cache.
  const instagramProfileTtlMs =
    requireNonNegInt(env.INSTAGRAM_PROFILE_TTL_SECONDS, 'INSTAGRAM_PROFILE_TTL_SECONDS', 604800) * 1000;

  return {
    port: toInt(env.PORT, 3000),
    host: env.HOST || '0.0.0.0',
    apiKeys,
    pageScopes,
    allowedPages: parseAllowedPages(env.ALLOWED_PAGES),
    instagramAllowedProfiles: parseInstagramAllowedProfiles(env.INSTAGRAM_ALLOWED_PROFILES),
    allowedOrigins: toList(env.ALLOWED_ORIGINS),
    /** Comma-separated origins allowed for cookie-authenticated admin mutations (no wildcards). */
    adminAllowedOrigins: toList(env.ADMIN_ALLOWED_ORIGINS),
    managementDir: env.MANAGEMENT_DIR || './data/management',
    bootstrapSetupToken: env.BOOTSTRAP_SETUP_TOKEN || '',
    adminInternalSecret: env.ADMIN_INTERNAL_SECRET || '',
    /** Base64-encoded 32-byte key for AES-256-GCM provider credential encryption. */
    dataEncryptionKey: env.DATA_ENCRYPTION_KEY || '',
    trustProxy: String(env.TRUST_PROXY || '').trim() === '1',
    adminCookieSecure:
      String(env.ADMIN_COOKIE_SECURE || '').trim() === '1'
        ? true
        : String(env.ADMIN_COOKIE_SECURE || '').trim() === '0'
          ? false
          : null,
    rateLimitPerMin: toInt(env.RATE_LIMIT_PER_MIN, 120),
    cacheDir: env.CACHE_DIR || './data/cache',
    freshTtlMs: toInt(env.FRESH_TTL_SECONDS, 21600) * 1000,
    retryCooldownMs: toInt(env.RETRY_COOLDOWN_SECONDS, 300) * 1000,
    maxPosts: Math.max(1, toInt(env.MAX_POSTS, 10)),
    providers: toList(env.PROVIDERS || 'graph,apify').map((s) => s.toLowerCase()),
    retries: toInt(env.UPSTREAM_RETRIES, 2),
    backoffMs: toInt(env.RETRY_BACKOFF_MS, 2000),
    warmPagesRaw: env.WARM_PAGES || '',
    instagramWarmProfilesRaw: env.INSTAGRAM_WARM_PROFILES || '',
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
    /**
     * Test/isolated only: override Apify token verification base (GET /v2/users/me).
     * Leave unset in production so verification stays on api.apify.com.
     */
    apifyVerifyBaseUrl: (env.APIFY_VERIFY_BASE_URL || '').trim() || '',
    instagramApify: {
      actor: (env.INSTAGRAM_APIFY_ACTOR || 'apify~instagram-post-scraper').replace('/', '~'),
      input: instagramApifyInput,
      timeoutMs: toInt(env.INSTAGRAM_APIFY_TIMEOUT_MS, toInt(env.APIFY_TIMEOUT_MS, 150000)),
      // Optional gitignored capture dir for controlled live acceptance (never commit raw).
      captureDir: (env.INSTAGRAM_CAPTURE_DIR || '').trim() || null,
    },
    instagramProfileLogos,
    instagramProfileTtlMs,
    instagramProfileEnrichment: {
      // Disabled by default — separate Actor (apify/instagram-profile-scraper), shared quota + USD cap.
      enabled: instagramProfileEnrichmentEnabled,
      actor: (env.INSTAGRAM_PROFILE_ACTOR || 'apify~instagram-profile-scraper').replace('/', '~'),
      timeoutMs: toInt(env.INSTAGRAM_PROFILE_TIMEOUT_MS, 60000),
    },
    graph: {
      tokens: graphTokens,
      version: env.GRAPH_VERSION || 'v23.0',
      baseUrl: (env.GRAPH_BASE_URL || 'https://graph.facebook.com').replace(/\/+$/, ''),
      timeoutMs: toInt(env.GRAPH_TIMEOUT_MS, 20000),
    },
  };
}
