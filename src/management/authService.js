import { openManagementDb, integrityCheck } from './db.js';
import { createBootstrapService } from './bootstrap.js';
import { createSessionService } from './sessions.js';
import { createRateLimiter } from './rateLimit.js';
import { createAccountSecurityService } from './accountSecurity.js';
import { hashPassword, verifyPassword, validatePassword, validateUsername } from './passwords.js';
import { validateEmail, loadSmtpConfig } from './email.js';
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
  const getAdminByEmail = db.prepare('SELECT * FROM admin_users WHERE email = ? COLLATE NOCASE');
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

  const getSmtpConfig = options.getSmtpConfig || (() => loadSmtpConfig(process.env));
  const getEncryptionKey = options.getEncryptionKey
    || (() => options.dataEncryptionKey || process.env.DATA_ENCRYPTION_KEY || '');

  const accountSecurity = createAccountSecurityService(db, {
    sessions,
    getEncryptionKey,
    getSmtpConfig,
    limiter,
    logEvent,
  });

  function findAdminByLogin(loginRaw) {
    const raw = String(loginRaw || '').trim();
    if (!raw) return null;
    const asEmail = validateEmail(raw);
    if (asEmail.ok) {
      const byEmail = getAdminByEmail.get(asEmail.email);
      if (byEmail) return byEmail;
    }
    const asUser = validateUsername(raw);
    if (asUser.ok) return getAdminByUsername.get(asUser.username) || null;
    return null;
  }

  function adminPublic(row, extras = {}) {
    const dto = accountSecurity.adminDto(row);
    return { ...dto, ...extras };
  }

  const api = {
    db,
    path: opened?.path || null,
    close: options.closeDb || (opened ? () => opened.close() : () => {}),
    bootstrap,
    sessions,
    accountSecurity,
    allowedOrigins,
    trustProxy,

    setupStatus() {
      const status = bootstrap.status();
      const smtp = getSmtpConfig();
      return {
        status,
        setupRequired: status !== 'completed',
        setupAvailable: status === 'ready',
        smtpConfigured: Boolean(smtp?.enabled),
        message:
          status === 'completed'
            ? 'Administrator is configured'
            : status === 'ready'
              ? 'Create the administrator account with your bootstrap token'
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

      const originCheck = api.assertMutationOrigin(req);
      if (!originCheck.ok) {
        return { ok: false, http: 403, code: 'CSRF_REJECTED', message: 'Origin check failed' };
      }

      const smtp = getSmtpConfig();
      const result = await bootstrap.complete({
        setupToken: body?.setupToken,
        email: body?.email,
        username: body?.username,
        password: body?.password,
        confirmPassword: body?.confirmPassword,
        emailVerified: false,
      });

      if (!result.ok) {
        logEvent('setup_failed', {
          username: body?.email || body?.username ? String(body.email || body.username).slice(0, 64) : null,
          ip,
          meta: { code: result.code },
        });
        const http = result.code === 'SETUP_COMPLETED' ? 409
          : result.code === 'SETUP_NOT_CONFIGURED' ? 503
          : result.code === 'INVALID_SETUP_TOKEN' ? 403
          : 400;
        return { ok: false, http, code: result.code, message: result.message };
      }

      let verificationRequired = false;
      if (smtp?.enabled && result.admin.email) {
        const sent = await accountSecurity.sendVerificationForEmail(result.admin.email);
        verificationRequired = Boolean(sent.ok);
      }

      logEvent('setup_completed', { username: result.admin.username, ip });
      const session = sessions.create(result.admin.id, {
        userAgent: req.headers?.['user-agent'],
        authLevel: 'full',
      });
      return {
        ok: true,
        http: 201,
        admin: adminPublic(getAdminById.get(1)),
        session,
        verificationRequired,
        smtpConfigured: Boolean(smtp?.enabled),
      };
    },

    async login(body, req) {
      const ip = clientIp(req);
      const loginRaw = typeof body?.email === 'string' && body.email.trim()
        ? body.email
        : (typeof body?.username === 'string' ? body.username : (typeof body?.login === 'string' ? body.login : ''));
      const rlIp = limiter.check(rateKey('login_ip', ip, ''), { max: options.loginIpRateMax ?? 30 });
      if (!rlIp.allowed) {
        logEvent('login_rate_limited', { ip, meta: { scope: 'ip' } });
        return { ok: false, http: 429, code: 'RATE_LIMITED', message: 'Too many attempts', retryAfterSec: rlIp.retryAfterSec };
      }
      const rlUser = limiter.check(rateKey('login_user', ip, loginRaw), { max: options.loginUserRateMax ?? 10 });
      if (!rlUser.allowed) {
        logEvent('login_rate_limited', { username: loginRaw.slice(0, 64), ip, meta: { scope: 'user' } });
        return { ok: false, http: 429, code: 'RATE_LIMITED', message: 'Too many attempts', retryAfterSec: rlUser.retryAfterSec };
      }

      const originCheck = api.assertMutationOrigin(req);
      if (!originCheck.ok) {
        return { ok: false, http: 403, code: 'CSRF_REJECTED', message: 'Origin check failed' };
      }

      const password = typeof body?.password === 'string' ? body.password : '';
      const admin = findAdminByLogin(loginRaw);

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
        logEvent('login_failed', { username: loginRaw.slice(0, 64), ip });
        return { ok: false, http: 401, code: 'INVALID_CREDENTIALS', message: 'Invalid email/username or password' };
      }

      const mfaRequired = Boolean(admin.totp_enabled);
      const session = sessions.create(admin.id, {
        userAgent: req.headers?.['user-agent'],
        authLevel: mfaRequired ? 'password' : 'full',
        mfaPending: mfaRequired,
      });
      logEvent(mfaRequired ? 'login_password_ok_mfa_pending' : 'login_ok', { username: admin.username, ip });
      return {
        ok: true,
        http: 200,
        admin: adminPublic(admin),
        session,
        mfaRequired,
      };
    },

    async mfaVerify(body, req) {
      const originCheck = api.assertMutationOrigin(req);
      if (!originCheck.ok) {
        return { ok: false, http: 403, code: 'CSRF_REJECTED', message: 'Origin check failed' };
      }
      const token = extractSessionToken(req);
      const v = sessions.validate(token, { requireFull: false });
      if (!v.ok) {
        return { ok: false, http: 401, code: 'UNAUTHORIZED', message: 'Authentication required' };
      }
      if (!v.mfaPending) {
        return {
          ok: true,
          http: 200,
          admin: adminPublic(getAdminById.get(v.admin.id)),
          alreadyComplete: true,
          mfaRequired: false,
        };
      }
      const csrfHeader = req.headers?.['x-csrf-token'] || req.headers?.['X-CSRF-Token'];
      if (!originCheck.internal && !sessions.verifyCsrf(v.csrfHash, csrfHeader)) {
        return { ok: false, http: 403, code: 'CSRF_REJECTED', message: 'Invalid CSRF token' };
      }
      const rl = limiter.check(rateKey('mfa', clientIp(req), String(v.admin.id)), { max: 15 });
      if (!rl.allowed) {
        return { ok: false, http: 429, code: 'RATE_LIMITED', message: 'Too many attempts', retryAfterSec: rl.retryAfterSec };
      }
      const result = accountSecurity.completeMfaChallenge({
        sessionValidation: v,
        code: body?.code,
      });
      if (!result.ok) return result;
      return {
        ok: true,
        http: 200,
        admin: result.admin,
        mfaRequired: false,
      };
    },

    logout(req) {
      const token = extractSessionToken(req);
      if (token) sessions.revokeToken(token);
      logEvent('logout', { ip: clientIp(req) });
      return { ok: true, http: 200 };
    },

    me(req) {
      const auth = api.requireSession(req, { requireCsrf: false, allowMfaPending: true });
      if (!auth.ok) return auth;
      const row = getAdminById.get(auth.admin.id);
      return {
        ok: true,
        http: 200,
        admin: adminPublic(row),
        mfaPending: Boolean(auth.mfaPending),
        authLevel: auth.authLevel || 'full',
      };
    },

    securityStatus(req) {
      const auth = api.requireSession(req, { requireCsrf: false });
      if (!auth.ok) return auth;
      return { ok: true, http: 200, data: accountSecurity.securityStatus() };
    },

    async enrollEmail(body, req) {
      const auth = api.requireSession(req, { requireCsrf: true });
      if (!auth.ok) return auth;
      return accountSecurity.beginEmailEnrollment({
        email: body?.email,
        currentPassword: body?.currentPassword,
      }, { userAgent: req.headers?.['user-agent'] });
    },

    async verifyEmail(body, req) {
      const auth = api.requireSession(req, { requireCsrf: true });
      if (!auth.ok) return auth;
      return accountSecurity.verifyEmailOtp({ code: body?.code });
    },

    async resendEmailOtp(req) {
      const auth = api.requireSession(req, { requireCsrf: true });
      if (!auth.ok) return auth;
      return accountSecurity.resendEmailOtp();
    },

    async totpStart(body, req) {
      const auth = api.requireSession(req, { requireCsrf: true });
      if (!auth.ok) return auth;
      return accountSecurity.startTotpEnrollment({ currentPassword: body?.currentPassword });
    },

    async totpConfirm(body, req) {
      const auth = api.requireSession(req, { requireCsrf: true });
      if (!auth.ok) return auth;
      const result = await accountSecurity.confirmTotpEnrollment({ code: body?.code });
      if (!result.ok) return result;
      // Issue new full session after enrollment revoked all sessions
      const session = sessions.create(1, { userAgent: req.headers?.['user-agent'], authLevel: 'full' });
      return { ...result, session };
    },

    async totpDisable(body, req) {
      const auth = api.requireSession(req, { requireCsrf: true });
      if (!auth.ok) return auth;
      const result = await accountSecurity.disableTotp({
        currentPassword: body?.currentPassword,
        code: body?.code,
      });
      if (!result.ok) return result;
      const session = sessions.create(1, { userAgent: req.headers?.['user-agent'], authLevel: 'full' });
      return { ...result, session };
    },

    async recoveryCodesRegen(body, req) {
      const auth = api.requireSession(req, { requireCsrf: true });
      if (!auth.ok) return auth;
      return accountSecurity.regenerateRecoveryCodes({
        currentPassword: body?.currentPassword,
        code: body?.code,
      });
    },

    async changePassword(body, req) {
      const auth = api.requireSession(req, { requireCsrf: true });
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

      const session = sessions.create(admin.id, { userAgent: req.headers?.['user-agent'], authLevel: 'full' });
      return {
        ok: true,
        http: 200,
        admin: adminPublic(getAdminById.get(admin.id)),
        session,
        message: 'Password updated; all prior sessions revoked',
      };
    },

    /**
     * @param {{ requireCsrf?: boolean, allowMfaPending?: boolean, requireFull?: boolean }} opts
     */
    requireSession(req, opts = {}) {
      const { requireCsrf = true, allowMfaPending = false, requireFull = !allowMfaPending } = opts;
      const token = extractSessionToken(req);
      const v = sessions.validate(token, { requireFull });
      if (!v.ok) {
        if (v.reason === 'mfa_required') {
          return {
            ok: false,
            http: 401,
            code: 'MFA_REQUIRED',
            message: 'Multi-factor authentication required',
            mfaPending: true,
          };
        }
        return { ok: false, http: 401, code: 'UNAUTHORIZED', message: 'Authentication required' };
      }
      if (requireCsrf) {
        const method = (req.method || 'GET').toUpperCase();
        if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
          const originCheck = api.assertMutationOrigin(req);
          if (!originCheck.ok) {
            return { ok: false, http: 403, code: 'CSRF_REJECTED', message: 'Origin check failed' };
          }
          const csrfHeader = req.headers?.['x-csrf-token'] || req.headers?.['X-CSRF-Token'];
          if (!sessions.verifyCsrf(v.csrfHash, csrfHeader)) {
            return { ok: false, http: 403, code: 'CSRF_REJECTED', message: 'Invalid CSRF token' };
          }
        }
      }
      return {
        ok: true,
        admin: v.admin,
        sessionId: v.sessionId,
        mfaPending: v.mfaPending,
        authLevel: v.authLevel,
      };
    },

    assertMutationOrigin(req) {
      const presented = req.headers?.['x-admin-internal-secret'];
      if (internalSecret && presented && sha256Hex(presented) === sha256Hex(internalSecret)) {
        return { ok: true, internal: true };
      }
      return validateOrigin(req.headers || {}, allowedOrigins);
    },

    async recoverPassword(newPassword) {
      const p = validatePassword(newPassword);
      if (!p.ok) return { ok: false, message: p.message };
      const admin = getAdminById.get(1);
      if (!admin) return { ok: false, message: 'No administrator exists; run bootstrap setup instead' };
      const hashed = await hashPassword(newPassword);
      updatePassword.run(hashed.hash, hashed.algo, JSON.stringify(hashed.params), isoNow(), 1);
      // Also disable MFA so operator can regain access without authenticator after host recovery
      try {
        db.prepare(`
          UPDATE admin_users SET totp_enabled = 0, totp_ciphertext = NULL, totp_nonce = NULL,
            totp_auth_tag = NULL, totp_format_version = NULL, totp_confirmed_at = NULL, updated_at = ?
          WHERE id = 1
        `).run(isoNow());
        db.prepare('DELETE FROM totp_pending WHERE id = 1').run();
        db.prepare('DELETE FROM recovery_code_hashes WHERE admin_id = 1').run();
      } catch { /* ignore if columns missing mid-migration */ }
      const n = sessions.revokeAll(1);
      logEvent('recovery_password_reset', { username: admin.username, meta: { revokedSessions: n } });
      return { ok: true, username: admin.username, email: admin.email || null, revokedSessions: n };
    },
  };

  return api;
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
