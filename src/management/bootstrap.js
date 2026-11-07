import { safeEqualSecret, isoNow } from './cryptoUtil.js';
import { hashPassword, validatePassword, validateUsername } from './passwords.js';

/**
 * Bootstrap / first-admin setup using BOOTSTRAP_SETUP_TOKEN.
 * Completed state is persisted in bootstrap_state and survives restarts
 * even if the env var remains set.
 */
export function createBootstrapService(db, { getSetupToken } = {}) {
  const getState = db.prepare('SELECT * FROM bootstrap_state WHERE id = 1');
  const ensureState = db.prepare(`
    INSERT OR IGNORE INTO bootstrap_state (id, setup_completed_at, created_at)
    VALUES (1, NULL, ?)
  `);
  const completeState = db.prepare(`
    UPDATE bootstrap_state SET setup_completed_at = ? WHERE id = 1 AND setup_completed_at IS NULL
  `);
  const countAdmins = db.prepare('SELECT COUNT(*) AS c FROM admin_users');
  const insertAdmin = db.prepare(`
    INSERT INTO admin_users (id, username, password_hash, password_algo, password_params, created_at, updated_at)
    VALUES (1, ?, ?, ?, ?, ?, ?)
  `);

  function ensureRow() {
    ensureState.run(isoNow());
  }

  return {
    /** @returns {'needs_token'|'ready'|'completed'} */
    status() {
      ensureRow();
      const admins = countAdmins.get().c;
      const state = getState.get();
      if (admins > 0 || state?.setup_completed_at) return 'completed';
      const token = typeof getSetupToken === 'function' ? getSetupToken() : getSetupToken;
      if (!token) return 'needs_token';
      return 'ready';
    },

    isCompleted() {
      return this.status() === 'completed';
    },

    /**
     * Atomically create the sole administrator.
     * @returns {{ ok: true, admin: { id, username } } | { ok: false, code: string, message: string }}
     */
    async complete({ setupToken, username, password, confirmPassword }) {
      ensureRow();

      if (this.isCompleted()) {
        return { ok: false, code: 'SETUP_COMPLETED', message: 'Initial setup is already complete' };
      }

      const expected = typeof getSetupToken === 'function' ? getSetupToken() : getSetupToken;
      if (!expected || typeof expected !== 'string' || expected.length < 16) {
        return {
          ok: false,
          code: 'SETUP_NOT_CONFIGURED',
          message: 'Bootstrap setup token is not configured. Set BOOTSTRAP_SETUP_TOKEN on the API host.',
        };
      }
      if (!setupToken || !safeEqualSecret(String(setupToken), expected)) {
        return { ok: false, code: 'INVALID_SETUP_TOKEN', message: 'Invalid setup token' };
      }

      const u = validateUsername(username);
      if (!u.ok) return { ok: false, code: 'VALIDATION_ERROR', message: u.message };
      const p = validatePassword(password);
      if (!p.ok) return { ok: false, code: 'VALIDATION_ERROR', message: p.message };
      if (password !== confirmPassword) {
        return { ok: false, code: 'VALIDATION_ERROR', message: 'Passwords do not match' };
      }

      const hashed = await hashPassword(password);
      const now = isoNow();

      db.exec('BEGIN IMMEDIATE;');
      try {
        // Re-check inside lock
        const admins = countAdmins.get().c;
        const state = getState.get();
        if (admins > 0 || state?.setup_completed_at) {
          db.exec('ROLLBACK;');
          return { ok: false, code: 'SETUP_COMPLETED', message: 'Initial setup is already complete' };
        }
        insertAdmin.run(u.username, hashed.hash, hashed.algo, JSON.stringify(hashed.params), now, now);
        const updated = completeState.run(now);
        if (updated.changes !== 1) {
          db.exec('ROLLBACK;');
          return { ok: false, code: 'SETUP_COMPLETED', message: 'Initial setup is already complete' };
        }
        db.exec('COMMIT;');
        return { ok: true, admin: { id: 1, username: u.username } };
      } catch (err) {
        try { db.exec('ROLLBACK;'); } catch { /* ignore */ }
        if (String(err?.message || '').includes('UNIQUE')) {
          return { ok: false, code: 'SETUP_COMPLETED', message: 'Initial setup is already complete' };
        }
        throw err;
      }
    },
  };
}
