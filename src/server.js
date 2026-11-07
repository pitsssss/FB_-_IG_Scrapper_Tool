import http from 'node:http';
import { createService } from './service.js';
import { parseFacebookUsername } from './pageRef.js';
import { parseInstagramUsername } from './instagramRef.js';
import { ServiceError } from './errors.js';
import { createManagementHub } from './management/hub.js';
import { createKeyAuthenticator } from './management/keyAuthenticator.js';
import { handleAdminRoutes } from './admin/routes.js';

const errBody = (code, message) => ({ success: false, error: { code, message } });

const ROUTES = {
  '/api/v1/facebook/posts': 'facebook',
  '/api/v1/instagram/posts': 'instagram',
};

/**
 * @param {object} config
 * @param {ReturnType<typeof createService>} [service]
 * @param {{ hub?: object, disableHub?: boolean, hubOptions?: object, authService?: object }} [options]
 */
export function createApp(config, service = createService(config), options = {}) {
  // Empty API_KEYS is allowed: public posts stay 401 until env or managed keys exist.
  // Admin bootstrap/setup still works via management hub.

  let hub = options.hub || null;
  let hubInitError = null;
  let keyAuth = null;
  if (hub && typeof hub.bindService === 'function') {
    hub.bindService(service);
  }

  function getHub() {
    if (hub) return hub;
    if (hubInitError || options.disableHub) return null;
    if (options.authService && !options.forceHub) {
      // Auth-only test path: skip hub unless forceHub is set
      return null;
    }
    try {
      hub = createManagementHub(config, {
        ...(options.hubOptions || {}),
        getQuota: () => service?.quota || null,
      });
      hub.bindService(service);
      hub.bindPublicKeyAuth?.(keyAuth);
      keyAuth?.refreshManaged();
      keyAuth?.refreshAllowlists?.();
      return hub;
    } catch (err) {
      hubInitError = err;
      console.error('[admin] failed to open management hub:', err?.message || err);
      return null;
    }
  }

  keyAuth = createKeyAuthenticator({
    envKeys: config.apiKeys || [],
    envPageScopes: config.pageScopes,
    getManagedSnapshot: () => getHub()?.apiKeys.activeSnapshot() || [],
    getAllowedPages: () => config.allowedPages || [],
    getInstagramAllowedProfiles: () => config.instagramAllowedProfiles || [],
    onManagedUse(id) {
      getHub()?.apiKeys.markUsed(id);
    },
  });

  const windows = new Map();

  function authenticate(req) {
    // Always reload managed key snapshot so create/revoke/rotate apply immediately
    // (hub.keyAuth is a separate instance; this is the request authenticator).
    keyAuth.refreshManaged();
    return keyAuth.authenticate(req);
  }

  function pageAllowedForClient(client, ref) {
    return keyAuth.pageAllowedForClient(client, ref);
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
    const out = {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...headers,
    };
    const existingCookie = res.getHeader?.('set-cookie');
    if (existingCookie && out['set-cookie'] === undefined) {
      out['set-cookie'] = existingCookie;
    }
    res.writeHead(status, out);
    res.end(payload);
  }

  function recordTelemetry( partial) {
    try {
      getHub()?.telemetry?.record(partial);
    } catch {
      /* never break requests */
    }
  }

  async function handlePosts(req, res, url, platform) {
    const started = Date.now();
    const client = authenticate(req);
    if (!client) {
      recordTelemetry({ category: 'unauthorized', outcome: 'denied', platform, httpStatus: 401 });
      return send(res, 401, errBody('UNAUTHORIZED', 'Missing or invalid API key'));
    }

    const wait = rateLimited(client.name);
    if (wait) {
      recordTelemetry({
        category: 'rate_limited',
        outcome: 'denied',
        platform,
        clientName: client.name,
        httpStatus: 429,
      });
      return send(res, 429, errBody('RATE_LIMITED', 'Too many requests'), { 'retry-after': String(wait) });
    }

    const pageParam = url.searchParams.get('page');
    const label = platform === 'instagram' ? 'Instagram username' : 'Facebook page username';
    if (!pageParam) {
      return send(res, 400, errBody('MISSING_PAGE', `Query parameter "page" (${label}) is required`));
    }
    if (pageParam.length > 100) {
      return send(res, 400, errBody('INVALID_PAGE_URL', `Not a valid ${label}`));
    }

    const ref = platform === 'instagram'
      ? parseInstagramUsername(pageParam)
      : parseFacebookUsername(pageParam);
    if (!ref) {
      return send(res, 400, errBody('INVALID_PAGE_URL', `Not a valid ${label}`));
    }

    if (!pageAllowedForClient(client, ref)) {
      recordTelemetry({
        category: 'forbidden',
        outcome: 'denied',
        platform,
        clientName: client.name,
        httpStatus: 403,
      });
      return send(res, 403, errBody('PAGE_NOT_ALLOWED', 'This page is not allowed on this server'));
    }

    const parsed = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
    const limit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), config.maxPosts) : config.maxPosts;

    try {
      const result = await service.getPosts(ref, limit);
      const durationMs = Date.now() - started;
      const source = result?.meta?.source || null;
      recordTelemetry({
        category: 'public_request',
        outcome: 'ok',
        platform,
        clientName: client.name,
        httpStatus: 200,
        durationMs,
        source,
      });
      if (source === 'cache') {
        recordTelemetry({ category: 'cache_hit', outcome: 'ok', platform, clientName: client.name, source });
      } else if (source === 'stale-cache') {
        recordTelemetry({ category: 'stale_cache', outcome: 'ok', platform, clientName: client.name, source });
      } else if (source === 'live') {
        recordTelemetry({ category: 'live_response', outcome: 'ok', platform, clientName: client.name, source });
        recordTelemetry({ category: 'provider_attempt', outcome: 'ok', platform, clientName: client.name, source: 'live' });
      }
      return send(res, 200, result, { 'cache-control': 'private, max-age=60' });
    } catch (err) {
      if (err instanceof ServiceError && (err.status === 502 || err.code === 'UPSTREAM_UNAVAILABLE')) {
        recordTelemetry({
          category: 'provider_failure',
          outcome: 'error',
          platform,
          clientName: client.name,
          httpStatus: err.status,
          durationMs: Date.now() - started,
        });
        recordTelemetry({
          category: 'provider_attempt',
          outcome: 'error',
          platform,
          clientName: client.name,
          httpStatus: err.status,
        });
      }
      throw err;
    }
  }

  async function handle(req, res) {
    applyCors(req, res);
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url, 'http://localhost');

    if (url.pathname.startsWith('/api/v1/admin')) {
      const h = getHub();
      const auth = h?.auth || options.authService || null;
      const handled = await handleAdminRoutes(req, res, url, {
        auth,
        hub: h,
        service,
        config,
        send,
      });
      if (handled) return;
    }

    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });

    const platform = ROUTES[url.pathname];
    if (!platform) return send(res, 404, errBody('NOT_FOUND', 'Route not found'));
    if (req.method !== 'GET') {
      return send(res, 405, errBody('METHOD_NOT_ALLOWED', 'Use GET'), { allow: 'GET, OPTIONS' });
    }
    return handlePosts(req, res, url, platform);
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      if (err instanceof ServiceError) return send(res, err.status, errBody(err.code, err.message));
      console.error('[server] unexpected error:', err);
      return send(res, 500, errBody('INTERNAL_ERROR', 'Unexpected server error'));
    });
  });

  server.getHub = getHub;
  server.getAuthService = () => getHub()?.auth || options.authService || null;
  server.closeAuth = () => {
    if (hub?.close) hub.close();
    hub = null;
    if (options.authService?.close) options.authService.close();
  };
  return server;
}
