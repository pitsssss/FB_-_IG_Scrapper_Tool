import { createHash, timingSafeEqual } from 'node:crypto';
import { SESSION_COOKIE, CSRF_COOKIE, SESSION_ABSOLUTE_MS } from '../management/sessions.js';
import { createManagementHandlers } from './managementRoutes.js';

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
    csrfToken: result.session?.csrf,
  };
  if (result.message) data.message = result.message;
  if (result.mfaRequired != null) data.mfaRequired = Boolean(result.mfaRequired);
  if (result.verificationRequired != null) data.verificationRequired = Boolean(result.verificationRequired);
  if (result.smtpConfigured != null) data.smtpConfigured = Boolean(result.smtpConfigured);
  if (result.recoveryCodes) data.recoveryCodes = result.recoveryCodes;
  if (result.secret) data.secret = result.secret;
  if (result.otpauthUrl) data.otpauthUrl = result.otpauthUrl;
  if (includeSessionToken && result.session?.token) data.sessionToken = result.session.token;
  return data;
}

function mutationResult(res, result, { secure, includeSessionToken, send }) {
  if (!result.ok) {
    const headers = result.retryAfterSec ? { 'retry-after': String(result.retryAfterSec) } : {};
    return send(res, result.http, errBody(result.code, result.message), headers);
  }
  if (result.session) {
    setSessionCookies(res, result.session, { secure });
  }
  return send(res, result.http || 200, {
    success: true,
    data: sessionResponseData(result, { includeSessionToken }),
  });
}

/**
 * Handle /api/v1/admin/* routes.
 * @returns {Promise<boolean>} true if handled
 */
export async function handleAdminRoutes(req, res, url, { auth, hub, service, config, send }) {
  if (!url.pathname.startsWith('/api/v1/admin')) return false;

  if (!auth && !hub) {
    send(res, 503, errBody('ADMIN_UNAVAILABLE', 'Management authentication is not configured'));
    return true;
  }

  const authSvc = auth || hub?.auth;
  const secure = cookieSecure(req, config);
  const method = (req.method || 'GET').toUpperCase();
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const mgmt = hub ? createManagementHandlers({ hub, service, config }) : null;

  const routes = {
    'GET /api/v1/admin/setup/status': async () => {
      const data = authSvc.setupStatus();
      return send(res, 200, { success: true, data });
    },
    'POST /api/v1/admin/setup': async () => {
      const body = await readJsonBody(req);
      const result = await authSvc.setup(body, req);
      return mutationResult(res, result, {
        secure,
        includeSessionToken: isInternalCaller(req, config),
        send,
      });
    },
    'POST /api/v1/admin/login': async () => {
      const body = await readJsonBody(req);
      const result = await authSvc.login(body, req);
      return mutationResult(res, result, {
        secure,
        includeSessionToken: isInternalCaller(req, config),
        send,
      });
    },
    'POST /api/v1/admin/mfa/verify': async () => {
      const body = await readJsonBody(req);
      const result = await authSvc.mfaVerify(body, req);
      if (!result.ok) {
        const headers = result.retryAfterSec ? { 'retry-after': String(result.retryAfterSec) } : {};
        return send(res, result.http, errBody(result.code, result.message), headers);
      }
      return send(res, 200, {
        success: true,
        data: {
          admin: result.admin,
          mfaRequired: false,
          alreadyComplete: Boolean(result.alreadyComplete),
        },
      });
    },
    'POST /api/v1/admin/logout': async () => {
      const gate = authSvc.requireSession(req, { requireCsrf: true, allowMfaPending: true });
      if (!gate.ok && gate.code === 'CSRF_REJECTED') {
        return send(res, gate.http, errBody(gate.code, gate.message));
      }
      authSvc.logout(req);
      clearSessionCookies(res, { secure });
      return send(res, 200, { success: true, data: { loggedOut: true } });
    },
    'GET /api/v1/admin/me': async () => {
      const result = authSvc.me(req);
      if (!result.ok) return send(res, result.http, errBody(result.code, result.message));
      return send(res, 200, {
        success: true,
        data: {
          admin: result.admin,
          mfaPending: Boolean(result.mfaPending),
          authLevel: result.authLevel || 'full',
        },
      });
    },
    'POST /api/v1/admin/password': async () => {
      const body = await readJsonBody(req);
      const result = await authSvc.changePassword(body, req);
      return mutationResult(res, result, {
        secure,
        includeSessionToken: isInternalCaller(req, config),
        send,
      });
    },
    'GET /api/v1/admin/session': async () => {
      const result = authSvc.me(req);
      if (!result.ok) return send(res, result.http, errBody(result.code, result.message));
      return send(res, 200, {
        success: true,
        data: {
          authenticated: !result.mfaPending,
          mfaPending: Boolean(result.mfaPending),
          authLevel: result.authLevel || 'full',
          admin: result.admin,
        },
      });
    },
    'GET /api/v1/admin/security': async () => {
      const result = authSvc.securityStatus(req);
      if (!result.ok) return send(res, result.http, errBody(result.code, result.message));
      return send(res, 200, { success: true, data: result.data });
    },
    'POST /api/v1/admin/security/email': async () => {
      const body = await readJsonBody(req);
      const result = await authSvc.enrollEmail(body, req);
      return mutationResult(res, result, {
        secure,
        includeSessionToken: isInternalCaller(req, config),
        send,
      });
    },
    'POST /api/v1/admin/security/email/verify': async () => {
      const body = await readJsonBody(req);
      const result = await authSvc.verifyEmail(body, req);
      if (!result.ok) return send(res, result.http, errBody(result.code, result.message));
      return send(res, 200, { success: true, data: { admin: result.admin } });
    },
    'POST /api/v1/admin/security/email/resend': async () => {
      const result = await authSvc.resendEmailOtp(req);
      if (!result.ok) return send(res, result.http, errBody(result.code, result.message));
      return send(res, 200, { success: true, data: { message: result.message } });
    },
    'POST /api/v1/admin/security/totp/start': async () => {
      const body = await readJsonBody(req);
      const result = await authSvc.totpStart(body, req);
      if (!result.ok) return send(res, result.http, errBody(result.code, result.message));
      return send(res, 200, {
        success: true,
        data: {
          secret: result.secret,
          otpauthUrl: result.otpauthUrl,
          message: result.message,
        },
      });
    },
    'POST /api/v1/admin/security/totp/confirm': async () => {
      const body = await readJsonBody(req);
      const result = await authSvc.totpConfirm(body, req);
      return mutationResult(res, result, {
        secure,
        includeSessionToken: isInternalCaller(req, config),
        send,
      });
    },
    'POST /api/v1/admin/security/totp/disable': async () => {
      const body = await readJsonBody(req);
      const result = await authSvc.totpDisable(body, req);
      return mutationResult(res, result, {
        secure,
        includeSessionToken: isInternalCaller(req, config),
        send,
      });
    },
    'POST /api/v1/admin/security/recovery-codes': async () => {
      const body = await readJsonBody(req);
      const result = await authSvc.recoveryCodesRegen(body, req);
      if (!result.ok) return send(res, result.http, errBody(result.code, result.message));
      return send(res, 200, { success: true, data: { recoveryCodes: result.recoveryCodes } });
    },
  };

  if (mgmt) {
    routes['GET /api/v1/admin/provider'] = async () => {
      const r = await mgmt.providerStatus(req);
      return send(res, r.http, r.body);
    };
    routes['POST /api/v1/admin/provider/validate'] = async () => {
      const body = await readJsonBody(req);
      const r = await mgmt.providerValidate(req, body);
      return send(res, r.http, r.body);
    };
    routes['POST /api/v1/admin/provider/connect'] = async () => {
      const body = await readJsonBody(req);
      const r = await mgmt.providerConnect(req, body);
      return send(res, r.http, r.body);
    };
    routes['POST /api/v1/admin/provider/disconnect'] = async () => {
      const r = await mgmt.providerDisconnect(req);
      return send(res, r.http, r.body);
    };
    routes['GET /api/v1/admin/api-keys'] = async () => {
      const r = await mgmt.listApiKeys(req);
      return send(res, r.http, r.body);
    };
    routes['POST /api/v1/admin/api-keys'] = async () => {
      const body = await readJsonBody(req);
      const r = await mgmt.createApiKey(req, body);
      return send(res, r.http, r.body);
    };
    routes['GET /api/v1/admin/cache'] = async () => {
      const r = await mgmt.cacheSummary(req);
      return send(res, r.http, r.body);
    };
    routes['GET /api/v1/admin/quota'] = async () => {
      const r = await mgmt.quotaStatus(req);
      return send(res, r.http, r.body);
    };
    routes['GET /api/v1/admin/health'] = async () => {
      const r = await mgmt.healthDetail(req);
      return send(res, r.http, r.body);
    };
    routes['GET /api/v1/admin/playground/cache'] = async () => {
      const r = await mgmt.playgroundCache(req, Object.fromEntries(url.searchParams.entries()));
      return send(res, r.http, r.body);
    };
    routes['POST /api/v1/admin/playground/prepare'] = async () => {
      const body = await readJsonBody(req);
      const r = await mgmt.playgroundPrepare(req, body);
      return send(res, r.http, r.body);
    };
    routes['POST /api/v1/admin/playground/confirm'] = async () => {
      const body = await readJsonBody(req);
      const r = await mgmt.playgroundConfirm(req, body);
      return send(res, r.http, r.body);
    };
    routes['POST /api/v1/admin/playground/cancel'] = async () => {
      const body = await readJsonBody(req);
      const r = await mgmt.playgroundCancel(req, body);
      return send(res, r.http, r.body);
    };
    routes['GET /api/v1/admin/settings'] = async () => {
      const r = await mgmt.getSettings(req);
      return send(res, r.http, r.body);
    };
    routes['PATCH /api/v1/admin/settings'] = async () => {
      const body = await readJsonBody(req);
      const r = await mgmt.patchSettings(req, body);
      return send(res, r.http, r.body);
    };
    routes['POST /api/v1/admin/settings/clear'] = async () => {
      const body = await readJsonBody(req);
      const r = await mgmt.clearSetting(req, body);
      return send(res, r.http, r.body);
    };
    routes['DELETE /api/v1/admin/cache/entry'] = async () => {
      const body = await readJsonBody(req);
      const r = await mgmt.deleteCacheEntry(req, body);
      return send(res, r.http, r.body);
    };
    routes['POST /api/v1/admin/cache/delete'] = async () => {
      // Alias for clients that cannot send DELETE bodies reliably
      const body = await readJsonBody(req);
      const r = await mgmt.deleteCacheEntry(req, body);
      return send(res, r.http, r.body);
    };
    routes['GET /api/v1/admin/usage/summary'] = async () => {
      const r = await mgmt.usageSummary(req, Object.fromEntries(url.searchParams.entries()));
      return send(res, r.http, r.body);
    };
    routes['GET /api/v1/admin/usage/events'] = async () => {
      const r = await mgmt.usageEvents(req, Object.fromEntries(url.searchParams.entries()));
      return send(res, r.http, r.body);
    };
  }

  // Pattern routes for key id
  const revokeMatch = /^\/api\/v1\/admin\/api-keys\/(\d+)\/revoke$/.exec(path);
  const rotateMatch = /^\/api\/v1\/admin\/api-keys\/(\d+)\/rotate$/.exec(path);
  const scopesMatch = /^\/api\/v1\/admin\/api-keys\/(\d+)\/scopes$/.exec(path);

  async function run() {
    if (mgmt && method === 'POST' && revokeMatch) {
      const r = await mgmt.revokeApiKey(req, revokeMatch[1]);
      return send(res, r.http, r.body);
    }
    if (mgmt && method === 'POST' && rotateMatch) {
      const r = await mgmt.rotateApiKey(req, rotateMatch[1]);
      return send(res, r.http, r.body);
    }
    if (mgmt && method === 'PUT' && scopesMatch) {
      const body = await readJsonBody(req);
      const r = await mgmt.updateApiKeyScopes(req, scopesMatch[1], body);
      return send(res, r.http, r.body);
    }

    const key = `${method} ${path}`;
    const handler = routes[key];
    if (!handler) {
      if (path.startsWith('/api/v1/admin')) {
        if (method === 'GET' || method === 'HEAD') {
          send(res, 404, errBody('NOT_FOUND', 'Admin route not found'));
          return;
        }
        send(res, 405, errBody('METHOD_NOT_ALLOWED', 'Method not allowed'), {
          allow: 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        });
        return;
      }
      return;
    }
    await handler();
  }

  try {
    await run();
  } catch (e) {
    if (e?.code === 'PAYLOAD_TOO_LARGE') {
      send(res, 413, errBody('PAYLOAD_TOO_LARGE', 'Request body too large'));
      return true;
    }
    if (e?.code === 'INVALID_JSON') {
      send(res, 400, errBody('INVALID_JSON', 'Invalid JSON body'));
      return true;
    }
    throw e;
  }
  return true;
}
