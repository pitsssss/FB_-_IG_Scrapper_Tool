import http from 'node:http';
import { createHash, timingSafeEqual } from 'node:crypto';
import { createService } from './service.js';
import { parseFacebookUsername } from './pageRef.js';
import { parseInstagramUsername } from './instagramRef.js';
import { ServiceError } from './errors.js';

const sha = (s) => createHash('sha256').update(s).digest();
const errBody = (code, message) => ({ success: false, error: { code, message } });

const ROUTES = {
  '/api/v1/facebook/posts': 'facebook',
  '/api/v1/instagram/posts': 'instagram',
};

export function createApp(config, service = createService(config)) {
  if (!config.apiKeys.length) {
    throw new Error('API_KEYS is required (e.g. API_KEYS=site1:KEY1,site2:KEY2)');
  }
  const keys = config.apiKeys.map((k) => ({ name: k.name, hash: sha(k.key) }));
  const windows = new Map();

  function authenticate(req) {
    // Credentials are accepted ONLY from headers — never from query strings.
    const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '');
    const headerKey = req.headers['x-api-key'];
    const supplied = (typeof headerKey === 'string' && headerKey) || (bearer && bearer[1]) || null;
    if (!supplied || typeof supplied !== 'string') return null;
    const given = sha(supplied);
    let name = null;
    for (const k of keys) {
      if (given.length === k.hash.length && timingSafeEqual(given, k.hash) && !name) name = k.name;
    }
    return name;
  }

  function pageAllowedForClient(clientName, ref) {
    const isIg = ref.platform === 'instagram' || String(ref.key || '').startsWith('instagram:');
    if (isIg) {
      const allow = config.instagramAllowedProfiles || [];
      if (allow.length && !allow.includes(ref.key)) return false;
    } else if (config.allowedPages.length && !config.allowedPages.includes(ref.key)) {
      return false;
    }
    if (!config.pageScopes) return true;
    const scope = config.pageScopes.get(clientName);
    return Boolean(scope && scope.has(ref.key));
  }

  function rateLimited(name) {
    if (!config.rateLimitPerMin) return 0;
    const now = Date.now();
    let w = windows.get(name);
    if (!w || now >= w.resetAt) {
      w = { count: 0, resetAt: now + 60_000 };
      windows.set(name, w);
    }
    w.count += 1;
    return w.count > config.rateLimitPerMin ? Math.ceil((w.resetAt - now) / 1000) : 0;
  }

  function applyCors(req, res) {
    const origin = req.headers.origin;
    if (!origin || !config.allowedOrigins.length) return;
    if (config.allowedOrigins.includes('*') || config.allowedOrigins.includes(origin)) {
      res.setHeader('access-control-allow-origin', config.allowedOrigins.includes('*') ? '*' : origin);
      res.setHeader('vary', 'Origin');
      res.setHeader('access-control-allow-headers', 'x-api-key, authorization, content-type');
      res.setHeader('access-control-allow-methods', 'GET, OPTIONS');
      res.setHeader('access-control-max-age', '86400');
    }
  }

  function send(res, status, body, headers = {}) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...headers,
    });
    res.end(payload);
  }

  async function handlePosts(req, res, url, platform) {
    const client = authenticate(req);
    if (!client) return send(res, 401, errBody('UNAUTHORIZED', 'Missing or invalid API key'));

    const wait = rateLimited(client);
    if (wait) return send(res, 429, errBody('RATE_LIMITED', 'Too many requests'), { 'retry-after': String(wait) });

    const pageParam = url.searchParams.get('page');
    const label = platform === 'instagram' ? 'Instagram username' : 'Facebook page username';
    if (!pageParam) {
      return send(res, 400, errBody('MISSING_PAGE', `Query parameter "page" (${label}) is required`));
    }
    if (pageParam.length > 100) {
      return send(res, 400, errBody('INVALID_PAGE_URL', `Not a valid ${label}`));
    }

    // Public contract: bare username only. Full social URLs are rejected with 400.
    const ref = platform === 'instagram'
      ? parseInstagramUsername(pageParam)
      : parseFacebookUsername(pageParam);
    if (!ref) {
      return send(res, 400, errBody('INVALID_PAGE_URL', `Not a valid ${label}`));
    }

    if (!pageAllowedForClient(client, ref)) {
      return send(res, 403, errBody('PAGE_NOT_ALLOWED', 'This page is not allowed on this server'));
    }

    const parsed = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
    const limit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), config.maxPosts) : config.maxPosts;

    const result = await service.getPosts(ref, limit);
    return send(res, 200, result, { 'cache-control': 'private, max-age=60' });
  }

  async function handle(req, res) {
    applyCors(req, res);
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });

    const platform = ROUTES[url.pathname];
    if (!platform) return send(res, 404, errBody('NOT_FOUND', 'Route not found'));
    if (req.method !== 'GET') {
      return send(res, 405, errBody('METHOD_NOT_ALLOWED', 'Use GET'), { allow: 'GET, OPTIONS' });
    }
    return handlePosts(req, res, url, platform);
  }

  return http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      if (err instanceof ServiceError) return send(res, err.status, errBody(err.code, err.message));
      console.error('[server] unexpected error:', err);
      return send(res, 500, errBody('INTERNAL_ERROR', 'Unexpected server error'));
    });
  });
}
