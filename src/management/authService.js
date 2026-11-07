import { openManagementDb, integrityCheck } from './db.js';
import { createBootstrapService } from './bootstrap.js';
import { createSessionService } from './sessions.js';
import { createRateLimiter } from './rateLimit.js';
import { hashPassword, verifyPassword, validatePassword, validateUsername } from './passwords.js';
import { sha256Hex, isoNow } from './cryptoUtil.js';
import { parseAllowedOrigins, validateOrigin, resolveClientIp } from './csrf.js';

/**
 * High-level management auth facade used by HTTP routes and recovery CLI.
 */
export function createAuthService(options = {}) {
  const managementDir = options.managementDir;
  if (!managementDir && !options.db) throw new Error('managementDir is required');

  let opened = null;
  let db = options.db || null;
  if (!db) {
    opened = openManagementDb(managementDir);
    db = opened.db;
    integrityCheck(db);
  } else {
    try { integrityCheck(db); } catch { /* caller already checked */ }
  }

  const getSetupToken = options.getSetupToken || (() => process.env.BOOTSTRAP_SETUP_TOKEN || '');
  const bootstrap = createBootstrapService(db, { getSetupToken });
  const sessions = createSessionService(db);
  const limiter = createRateLimiter(db, {
    windowMs: options.rateWindowMs ?? 15 * 60 * 1000,
    max: options.rateMax ?? 20,
  });

  const allowedOrigins = parseAllowedOrigins(
    options.allowedOrigins ?? process.env.ADMIN_ALLOWED_ORIGINS ?? '',
  );
  const trustProxy = options.trustProxy ?? process.env.TRUST_PROXY === '1';
  const internalSecret =
    options.internalSecret ?? process.env.ADMIN_INTERNAL_SECRET ?? '';

  const getAdminByUsername = db.prepare('SELECT * FROM admin_users WHERE username = ? COLLATE NOCASE');
  const getAdminById = db.prepare('SELECT * FROM admin_users WHERE id = ?');
  const updatePassword = db.prepare(`
    UPDATE admin_users
    SET password_hash = ?, password_algo = ?, password_params = ?, updated_at = ?
    WHERE id = ?
  `);
  const insertEvent = db.prepare(`
    INSERT INTO auth_events (at, event, username, ip_hash, meta_json)
    VALUES (?, ?, ?, ?, ?)
  `);

  function logEvent(event, { username = null, ip = null, meta = null } = {}) {
    try {
      insertEvent.run(
        isoNow(),
        event,
        username,
        ip ? sha256Hex(ip) : null,
        meta ? JSON.stringify(meta) : null,
      );
    } catch {
      /* never break auth on audit write failure */
    }
  }

  function clientIp(req) {
    return resolveClientIp(req, { trustProxy });
  }

  function rateKey(kind, ip, username) {
    return sha256Hex(`${kind}|${ip || ''}|${(username || '').toLowerCase()}`);
  }

  return {
    db,
    path: opened?.path || null,
    close: options.closeDb || (opened ? () => opened.close() : () => {}),
    bootstrap,
    sessions,
    allowedOrigins,
    trustProxy,

    setupStatus() {
      const status = bootstrap.status();
      return {
        status,
        setupRequired: status !== 'completed',
        setupAvailable: status === 'ready',
        message:
          status === 'completed'
            ? 'Administrator is configured'
            : status === 'ready'
              ? 'Initial setup is available'
              : 'Set BOOTSTRAP_SETUP_TOKEN on the API host, then open /setup',
      };
    },

    async setup(body, req) {
      const ip = clientIp(req);
      const rl = limiter.check(rateKey('setup', ip, ''), { max: options.setupRateMax ?? 10 });
      if (!rl.allowed) {
        logEvent('setup_rate_limited', { ip });
        return { ok: false, http: 429, code: 'RATE_LIMITED', message: 'Too many attempts', retryAfterSec: rl.retryAfterSec };
      }

      const originCheck = this.assertMutationOrigin(req);
      if (!originCheck.ok) {
        return { ok: false, http: 403, code: 'CSRF_REJECTED', message: 'Origin check failed' };
      }

      const result = await bootstrap.complete({
        setupToken: body?.setupToken,
        username: body?.username,
        password: body?.password,
        confirmPassword: body?.confirmPassword,
      });

      if (!result.ok) {
        logEvent('setup_failed', { username: body?.username ? String(body.username).slice(0, 64) : null, ip, meta: { code: result.code } });
        const http = result.code === 'SETUP_COMPLETED' ? 409
          : result.code === 'SETUP_NOT_CONFIGURED' ? 503
          : result.code === 'INVALID_SETUP_TOKEN' ? 403
          : 400;
        return { ok: false, http, code: result.code, message: result.message };
      }

      logEvent('setup_completed', { username: result.admin.username, ip });
      const session = sessions.create(result.admin.id, { userAgent: req.headers?.['user-agent'] });
      return {
        ok: true,
        http: 201,
        admin: result.admin,
        session,
      };
    },

    async login(body, req) {
      const ip = clientIp(req);
      const usernameRaw = typeof body?.username === 'string' ? body.username : '';
      const rlIp = limiter.check(rateKey('login_ip', ip, ''), { max: options.loginIpRateMax ?? 30 });
      if (!rlIp.allowed) {
        logEvent('login_rate_limited', { ip, meta: { scope: 'ip' } });
        return { ok: false, http: 429, code: 'RATE_LIMITED', message: 'Too many attempts', retryAfterSec: rlIp.retryAfterSec };
      }
      const rlUser = limiter.check(rateKey('login_user', ip, usernameRaw), { max: options.loginUserRateMax ?? 10 });
      if (!rlUser.allowed) {
        logEvent('login_rate_limited', { username: usernameRaw.slice(0, 64), ip, meta: { scope: 'user' } });
        return { ok: false, http: 429, code: 'RATE_LIMITED', message: 'Too many attempts', retryAfterSec: rlUser.retryAfterSec };
      }

      const originCheck = this.assertMutationOrigin(req);
      if (!originCheck.ok) {
        return { ok: false, http: 403, code: 'CSRF_REJECTED', message: 'Origin check failed' };
      }

      // Constant-ish failure path: always verify against a dummy when user missing.
      const uCheck = validateUsername(usernameRaw);
      const password = typeof body?.password === 'string' ? body.password : '';
      const admin = uCheck.ok ? getAdminByUsername.get(uCheck.username) : null;

      let valid = false;
      if (admin) {
        let params;
        try { params = JSON.parse(admin.password_params); } catch { params = null; }
        valid = await verifyPassword(password, {
          algo: admin.password_algo,
          params,
          hash: admin.password_hash,
        });
      } else {
        // Burn cycles to reduce username enumeration via timing
        await verifyPassword(password || 'x', {
          algo: 'scrypt',
          params: {
            N: 16384, r: 8, p: 1, keylen: 32,
            salt: Buffer.alloc(16).toString('base64'),
            maxmem: 64 * 1024 * 1024,
          },
          hash: Buffer.alloc(32).toString('base64'),
        }).catch(() => false);
      }

      if (!valid) {
        logEvent('login_failed', { username: usernameRaw.slice(0, 64), ip });
        return { ok: false, http: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid username or password' };
      }

      // Rotate: revoke nothing yet; create new session (old sessions remain until idle/absolute or password change)
      const session = sessions.create(admin.id, { userAgent: req.headers?.['user-agent'] });
      logEvent('login_ok', { username: admin.username, ip });
      return {
        ok: true,
        http: 200,
        admin: { id: admin.id, username: admin.username },
        session,
      };
    },

    logout(req) {
      const token = extractSessionToken(req);
      if (token) sessions.revokeToken(token);
      logEvent('logout', { ip: clientIp(req) });
      return { ok: true, http: 200 };
    },

    me(req) {
      const auth = this.requireSession(req, { requireCsrf: false });
      if (!auth.ok) return auth;
      return {
        ok: true,
        http: 200,
        admin: auth.admin,
      };
    },

    async changePassword(body, req) {
      const auth = this.requireSession(req, { requireCsrf: true });
      if (!auth.ok) return auth;

      const current = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
      const next = typeof body?.newPassword === 'string' ? body.newPassword : '';
      const confirm = typeof body?.confirmPassword === 'string' ? body.confirmPassword : '';
      const p = validatePassword(next);
      if (!p.ok) return { ok: false, http: 400, code: 'VALIDATION_ERROR', message: p.message };
      if (next !== confirm) return { ok: false, http: 400, code: 'VALIDATION_ERROR', message: 'Passwords do not match' };

      const admin = getAdminById.get(auth.admin.id);
      let params;
      try { params = JSON.parse(admin.password_params); } catch { params = null; }
      const ok = await verifyPassword(current, {
        algo: admin.password_algo,
        params,
        hash: admin.password_hash,
      });
      if (!ok) {
        return { ok: false, http: 401, code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect' };
      }

      const hashed = await hashPassword(next);
      updatePassword.run(hashed.hash, hashed.algo, JSON.stringify(hashed.params), isoNow(), admin.id);
      sessions.revokeAll(admin.id);
      logEvent('password_changed', { username: admin.username, ip: clientIp(req) });

      const session = sessions.create(admin.id, { userAgent: req.headers?.['user-agent'] });
      return {
        ok: true,
        http: 200,
        admin: { id: admin.id, username: admin.username },
        session,
        message: 'Password updated; all prior sessions revoked',
      };
    },

    /**
     * @param {{ requireCsrf?: boolean }} opts
     */
    requireSession(req, opts = {}) {
      const { requireCsrf = true } = opts;
      const token = extractSessionToken(req);
      const v = sessions.validate(token);
      if (!v.ok) {
        return { ok: false, http: 401, code: 'UNAUTHORIZED', message: 'Authentication required' };
      }
      if (requireCsrf) {
        const method = (req.method || 'GET').toUpperCase();
        if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
          const originCheck = this.assertMutationOrigin(req);
          if (!originCheck.ok) {
            return { ok: false, http: 403, code: 'CSRF_REJECTED', message: 'Origin check failed' };
          }
          const csrfHeader = req.headers?.[ 'x-csrf-token'] || req.headers?.['X-CSRF-Token'];
          if (!sessions.verifyCsrf(v.csrfHash, csrfHeader)) {
            return { ok: false, http: 403, code: 'CSRF_REJECTED', message: 'Invalid CSRF token' };
          }
        }
      }
      return { ok: true, admin: v.admin, sessionId: v.sessionId };
    },

    assertMutationOrigin(req) {
      // Internal service-to-service (dashboard BFF) may present a shared secret.
      const presented = req.headers?.['x-admin-internal-secret'];
      if (internalSecret && presented && sha256Hex(presented) === sha256Hex(internalSecret)) {
        return { ok: true, internal: true };
      }
      return validateOrigin(req.headers || {}, allowedOrigins);
    },

    /** Recovery: reset password for the sole admin (CLI only). */
    async recoverPassword(newPassword) {
      const p = validatePassword(newPassword);
      if (!p.ok) return { ok: false, message: p.message };
      const admin = getAdminById.get(1);
      if (!admin) return { ok: false, message: 'No administrator exists; run bootstrap setup instead' };
      const hashed = await hashPassword(newPassword);
      updatePassword.run(hashed.hash, hashed.algo, JSON.stringify(hashed.params), isoNow(), 1);
      const n = sessions.revokeAll(1);
      logEvent('recovery_password_reset', { username: admin.username, meta: { revokedSessions: n } });
      return { ok: true, username: admin.username, revokedSessions: n };
    },
  };
}

export function extractSessionToken(req) {
  if (!req) return null;
  const header = req.headers?.['x-admin-session'];
  if (typeof header === 'string' && header.trim()) return header.trim();
  const cookie = req.headers?.cookie;
  if (typeof cookie === 'string') {
    const match = cookie.match(/(?:^|;\s*)smp_admin_session=([^;]+)/);
    if (match) {
      try { return decodeURIComponent(match[1]); } catch { return match[1]; }
    }
  }
  return null;
}
