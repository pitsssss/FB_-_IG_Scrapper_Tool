import { createHash, timingSafeEqual } from 'node:crypto';
import { SESSION_COOKIE, CSRF_COOKIE, SESSION_ABSOLUTE_MS } from '../management/sessions.js';

const errBody = (code, message) => ({ success: false, error: { code, message } });
const sha256 = (s) => createHash('sha256').update(String(s)).digest();

async function readJsonBody(req, { maxBytes = 32_768 } = {}) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      const err = new Error('Body too large');
      err.code = 'PAYLOAD_TOO_LARGE';
      throw err;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error('Invalid JSON body');
    err.code = 'INVALID_JSON';
    throw err;
  }
}

function setSessionCookies(res, session, { secure }) {
  const maxAge = Math.floor(SESSION_ABSOLUTE_MS / 1000);
  const base = `Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  // Session cookie: HttpOnly. CSRF cookie: readable by JS for double-submit header.
  const csrfFlags = `Path=/; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  const cookies = [
    `${SESSION_COOKIE}=${encodeURIComponent(session.token)}; ${base}`,
    `${CSRF_COOKIE}=${encodeURIComponent(session.csrf)}; ${csrfFlags}`,
  ];
  res.setHeader('set-cookie', cookies);
}

function clearSessionCookies(res, { secure }) {
  const base = `Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;
  const csrfFlags = `Path=/; SameSite=Strict; Max-Age=0${secure ? '; Secure' : ''}`;
  res.setHeader('set-cookie', [
    `${SESSION_COOKIE}=; ${base}`,
    `${CSRF_COOKIE}=; ${csrfFlags}`,
  ]);
}

function cookieSecure(req, config) {
  if (config.adminCookieSecure === true) return true;
  if (config.adminCookieSecure === false) return false;
  return process.env.NODE_ENV === 'production';
}

function isInternalCaller(req, config) {
  const secret = config.adminInternalSecret || process.env.ADMIN_INTERNAL_SECRET || '';
  const presented = req.headers?.['x-admin-internal-secret'];
  if (!secret || typeof presented !== 'string' || !presented) return false;
  const a = sha256(secret);
  const b = sha256(presented);
  return a.length === b.length && timingSafeEqual(a, b);
}

function sessionResponseData(result, { includeSessionToken }) {
  const data = {
    admin: result.admin,
    csrfToken: result.session.csrf,
  };
  if (result.message) data.message = result.message;
  if (includeSessionToken) data.sessionToken = result.session.token;
  return data;
}

/**
 * Handle /api/v1/admin/* routes.
 * @returns {Promise<boolean>} true if handled
 */
export async function handleAdminRoutes(req, res, url, { auth, config, send }) {
  if (!url.pathname.startsWith('/api/v1/admin')) return false;

  if (!auth) {
    send(res, 503, errBody('ADMIN_UNAVAILABLE', 'Management authentication is not configured'));
    return true;
  }

  const secure = cookieSecure(req, config);
  const method = (req.method || 'GET').toUpperCase();
  const path = url.pathname.replace(/\/+$/, '') || '/';

  // Never allow GET mutations
  const routes = {
    'GET /api/v1/admin/setup/status': async () => {
      const data = auth.setupStatus();
      return send(res, 200, { success: true, data });
    },
    'POST /api/v1/admin/setup': async () => {
      const body = await readJsonBody(req);
      const result = await auth.setup(body, req);
      if (!result.ok) {
        const headers = result.retryAfterSec ? { 'retry-after': String(result.retryAfterSec) } : {};
        return send(res, result.http, errBody(result.code, result.message), headers);
      }
      setSessionCookies(res, result.session, { secure });
      return send(res, result.http, {
        success: true,
        data: sessionResponseData(result, { includeSessionToken: isInternalCaller(req, config) }),
      });
    },
    'POST /api/v1/admin/login': async () => {
      const body = await readJsonBody(req);
      const result = await auth.login(body, req);
      if (!result.ok) {
        const headers = result.retryAfterSec ? { 'retry-after': String(result.retryAfterSec) } : {};
        return send(res, result.http, errBody(result.code, result.message), headers);
      }
      setSessionCookies(res, result.session, { secure });
      return send(res, result.http, {
        success: true,
        data: sessionResponseData(result, { includeSessionToken: isInternalCaller(req, config) }),
      });
    },
    'POST /api/v1/admin/logout': async () => {
      // CSRF required for logout
      const gate = auth.requireSession(req, { requireCsrf: true });
      if (!gate.ok && gate.code === 'CSRF_REJECTED') {
        return send(res, gate.http, errBody(gate.code, gate.message));
      }
      auth.logout(req);
      clearSessionCookies(res, { secure });
      return send(res, 200, { success: true, data: { loggedOut: true } });
    },
    'GET /api/v1/admin/me': async () => {
      const result = auth.me(req);
      if (!result.ok) return send(res, result.http, errBody(result.code, result.message));
      return send(res, 200, { success: true, data: { admin: result.admin } });
    },
    'POST /api/v1/admin/password': async () => {
      const body = await readJsonBody(req);
      const result = await auth.changePassword(body, req);
      if (!result.ok) {
        return send(res, result.http, errBody(result.code, result.message));
      }
      setSessionCookies(res, result.session, { secure });
      return send(res, 200, {
        success: true,
        data: sessionResponseData(result, { includeSessionToken: isInternalCaller(req, config) }),
      });
    },
    'GET /api/v1/admin/session': async () => {
      const result = auth.me(req);
      if (!result.ok) return send(res, result.http, errBody(result.code, result.message));
      return send(res, 200, { success: true, data: { authenticated: true, admin: result.admin } });
    },
  };

  const key = `${method} ${path}`;
  const handler = routes[key];
  if (!handler) {
    if (path.startsWith('/api/v1/admin')) {
      if (method === 'GET' || method === 'HEAD') {
        send(res, 404, errBody('NOT_FOUND', 'Admin route not found'));
        return true;
      }
      send(res, 405, errBody('METHOD_NOT_ALLOWED', 'Method not allowed'), {
        allow: 'GET, POST, OPTIONS',
      });
      return true;
    }
    return false;
  }

  try {
    await handler();
  } catch (err) {
    if (err?.code === 'PAYLOAD_TOO_LARGE') {
      return send(res, 413, errBody('PAYLOAD_TOO_LARGE', 'Request body too large'));
    }
    if (err?.code === 'INVALID_JSON') {
      return send(res, 400, errBody('INVALID_JSON', 'Invalid JSON body'));
    }
    throw err;
  }
  return true;
}
