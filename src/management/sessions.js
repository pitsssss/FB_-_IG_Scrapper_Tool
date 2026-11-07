import { randomToken, sha256Hex, isoNow } from './cryptoUtil.js';

export const SESSION_COOKIE = 'smp_admin_session';
export const CSRF_COOKIE = 'smp_admin_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/** Absolute session lifetime */
export const SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000;
/** Idle timeout */
export const SESSION_IDLE_MS = 2 * 60 * 60 * 1000;

export function createSessionService(db) {
  const insert = db.prepare(`
    INSERT INTO admin_sessions
      (token_hash, admin_id, csrf_hash, created_at, absolute_expires_at, idle_expires_at, last_seen_at, user_agent_hash, revoked_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `);
  const byHash = db.prepare(`
    SELECT s.*, u.username
    FROM admin_sessions s
    JOIN admin_users u ON u.id = s.admin_id
    WHERE s.token_hash = ?
  `);
  const touch = db.prepare(`
    UPDATE admin_sessions
    SET last_seen_at = ?, idle_expires_at = ?
    WHERE id = ? AND revoked_at IS NULL
  `);
  const revoke = db.prepare(`
    UPDATE admin_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL
  `);
  const revokeAllForAdmin = db.prepare(`
    UPDATE admin_sessions SET revoked_at = ? WHERE admin_id = ? AND revoked_at IS NULL
  `);

  return {
    create(adminId, { userAgent } = {}) {
      const token = randomToken(32);
      const csrf = randomToken(32);
      const now = Date.now();
      const createdAt = isoNow(now);
      insert.run(
        sha256Hex(token),
        adminId,
        sha256Hex(csrf),
        createdAt,
        isoNow(now + SESSION_ABSOLUTE_MS),
        isoNow(now + SESSION_IDLE_MS),
        createdAt,
        userAgent ? sha256Hex(userAgent) : null,
      );
      return { token, csrf, absoluteExpiresAt: isoNow(now + SESSION_ABSOLUTE_MS) };
    },

    /**
     * Validate session token. Extends idle timeout on success.
     * @returns {{ ok: true, admin: { id, username }, sessionId: number, csrfHash: string } | { ok: false, reason: string }}
     */
    validate(token, { nowMs = Date.now(), touchIdle = true } = {}) {
      if (!token || typeof token !== 'string') return { ok: false, reason: 'missing' };
      const row = byHash.get(sha256Hex(token));
      if (!row) return { ok: false, reason: 'not_found' };
      if (row.revoked_at) return { ok: false, reason: 'revoked' };
      const nowIso = isoNow(nowMs);
      if (row.absolute_expires_at <= nowIso) return { ok: false, reason: 'absolute_expired' };
      if (row.idle_expires_at <= nowIso) return { ok: false, reason: 'idle_expired' };
      if (touchIdle) {
        touch.run(nowIso, isoNow(nowMs + SESSION_IDLE_MS), row.id);
      }
      return {
        ok: true,
        admin: { id: row.admin_id, username: row.username },
        sessionId: row.id,
        csrfHash: row.csrf_hash,
      };
    },

    revokeToken(token) {
      if (!token) return false;
      const info = revoke.run(isoNow(), sha256Hex(token));
      return info.changes > 0;
    },

    revokeAll(adminId) {
      return revokeAllForAdmin.run(isoNow(), adminId).changes;
    },

    verifyCsrf(sessionCsrfHash, presented) {
      if (!presented || typeof presented !== 'string') return false;
      return sessionCsrfHash === sha256Hex(presented);
    },
  };
}
