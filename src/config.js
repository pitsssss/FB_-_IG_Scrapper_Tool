const toInt = (v, d) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : d;
};
const toList = (v) => String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const DEFAULT_APIFY_INPUT = '{"startUrls":[{"url":"{{PAGE_URL}}"}],"resultsLimit":"{{LIMIT}}"}';

export function loadConfig(env = process.env) {
  const apiKeys = toList(env.API_KEYS).map((entry) => {
    const i = entry.indexOf(':');
    return i > 0 ? { name: entry.slice(0, i), key: entry.slice(i + 1) } : { name: 'default', key: entry };
  });

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

  return {
    port: toInt(env.PORT, 3000),
    host: env.HOST || '0.0.0.0',
    apiKeys,
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
    apify: {
      token: env.APIFY_TOKEN || '',
      actor: (env.APIFY_ACTOR || 'apify~facebook-posts-scraper').replace('/', '~'),
      baseUrl: (env.APIFY_BASE_URL || 'https://api.apify.com').replace(/\/+$/, ''),
      input: apifyInput,
      timeoutMs: toInt(env.APIFY_TIMEOUT_MS, 150000),
    },
    graph: {
      tokens: graphTokens,
      version: env.GRAPH_VERSION || 'v23.0',
      baseUrl: (env.GRAPH_BASE_URL || 'https://graph.facebook.com').replace(/\/+$/, ''),
      timeoutMs: toInt(env.GRAPH_TIMEOUT_MS, 20000),
    },
  };
}
