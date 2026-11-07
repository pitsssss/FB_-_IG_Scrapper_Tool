import { randomInt } from 'node:crypto';
import { sha256Hex, isoNow } from './cryptoUtil.js';

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

/** 6-digit numeric OTP; store only sha256 hash. */
export function generateEmailOtp() {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  return { code, hash: sha256Hex(code) };
}

export function createEmailOtpService(db) {
  const insert = db.prepare(`
    INSERT INTO email_otp_challenges
      (admin_id, purpose, email, code_hash, created_at, expires_at, consumed_at, attempts)
    VALUES (?, ?, ?, ?, ?, ?, NULL, 0)
  `);
  const latest = db.prepare(`
    SELECT * FROM email_otp_challenges
    WHERE admin_id = ? AND purpose = ? AND consumed_at IS NULL
    ORDER BY id DESC LIMIT 1
  `);
  const consume = db.prepare(`
    UPDATE email_otp_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL
  `);
  const bumpAttempts = db.prepare(`
    UPDATE email_otp_challenges SET attempts = attempts + 1 WHERE id = ?
  `);
  const invalidateOpen = db.prepare(`
    UPDATE email_otp_challenges SET consumed_at = ?
    WHERE admin_id = ? AND purpose = ? AND consumed_at IS NULL
  `);

  return {
    issue(adminId, purpose, email) {
      const { code, hash } = generateEmailOtp();
      const now = Date.now();
      invalidateOpen.run(isoNow(now), adminId, purpose);
      insert.run(adminId, purpose, email, hash, isoNow(now), isoNow(now + OTP_TTL_MS));
      return { code, expiresAt: isoNow(now + OTP_TTL_MS) };
    },

    verify(adminId, purpose, code) {
      const row = latest.get(adminId, purpose);
      if (!row) return { ok: false, code: 'OTP_NOT_FOUND', message: 'No active verification code' };
      if (row.expires_at <= isoNow()) {
        return { ok: false, code: 'OTP_EXPIRED', message: 'Verification code expired' };
      }
      if (row.attempts >= OTP_MAX_ATTEMPTS) {
        return { ok: false, code: 'OTP_LOCKED', message: 'Too many verification attempts' };
      }
      bumpAttempts.run(row.id);
      if (sha256Hex(String(code || '').trim()) !== row.code_hash) {
        return { ok: false, code: 'OTP_INVALID', message: 'Invalid verification code' };
      }
      consume.run(isoNow(), row.id);
      return { ok: true, email: row.email };
    },
  };
}
