import { encryptSecret, decryptSecret, parseDataEncryptionKey } from './cryptoBox.js';
import { generateTotpSecret, verifyTotpCode, buildOtpAuthUri, generateTotpCode } from './totp.js';
import { createEmailOtpService } from './otp.js';
import { createRecoveryCodeService, generateRecoveryCodes } from './recoveryCodes.js';
import { validateEmail } from './email.js';
import { sendSmtpMail } from './smtp.js';
import { isoNow, sha256Hex } from './cryptoUtil.js';
import { verifyPassword } from './passwords.js';

/**
 * Email verification, TOTP MFA, and recovery-code management for the sole admin.
 */
export function createAccountSecurityService(db, {
  sessions,
  getEncryptionKey,
  getSmtpConfig,
  limiter,
  logEvent,
} = {}) {
  const emailOtp = createEmailOtpService(db);
  const recovery = createRecoveryCodeService(db);
  const getAdmin = db.prepare('SELECT * FROM admin_users WHERE id = 1');
  const updateEmail = db.prepare(`
    UPDATE admin_users
    SET email = ?, email_verified_at = ?, email_pending = ?, updated_at = ?
    WHERE id = 1
  `);
  const setPendingEmail = db.prepare(`
    UPDATE admin_users SET email_pending = ?, updated_at = ? WHERE id = 1
  `);
  const enableTotp = db.prepare(`
    UPDATE admin_users SET
      totp_enabled = 1,
      totp_ciphertext = ?, totp_nonce = ?, totp_auth_tag = ?, totp_format_version = ?,
      totp_confirmed_at = ?, updated_at = ?
    WHERE id = 1
  `);
  const disableTotp = db.prepare(`
    UPDATE admin_users SET
      totp_enabled = 0,
      totp_ciphertext = NULL, totp_nonce = NULL, totp_auth_tag = NULL,
      totp_format_version = NULL, totp_confirmed_at = NULL, updated_at = ?
    WHERE id = 1
  `);
  const upsertPendingTotp = db.prepare(`
    INSERT INTO totp_pending (id, admin_id, ciphertext, nonce, auth_tag, format_version, created_at, expires_at)
    VALUES (1, 1, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      ciphertext = excluded.ciphertext,
      nonce = excluded.nonce,
      auth_tag = excluded.auth_tag,
      format_version = excluded.format_version,
      created_at = excluded.created_at,
      expires_at = excluded.expires_at
  `);
  const getPendingTotp = db.prepare('SELECT * FROM totp_pending WHERE id = 1');
  const clearPendingTotp = db.prepare('DELETE FROM totp_pending WHERE id = 1');
  const insertUsedStep = db.prepare(`
    INSERT OR IGNORE INTO totp_used_steps (admin_id, step, used_at) VALUES (1, ?, ?)
  `);
  const loadUsedSteps = db.prepare(`
    SELECT step FROM totp_used_steps WHERE admin_id = 1 AND used_at > ?
  `);

  function requireKey() {
    try {
      return { key: parseDataEncryptionKey(typeof getEncryptionKey === 'function' ? getEncryptionKey() : getEncryptionKey) };
    } catch (err) {
      return { error: err };
    }
  }

  function decryptTotpSecret(admin) {
    if (!admin?.totp_ciphertext) return null;
    const keyResult = requireKey();
    if (keyResult.error) return null;
    try {
      return decryptSecret({
        nonce: admin.totp_nonce,
        ciphertext: admin.totp_ciphertext,
        authTag: admin.totp_auth_tag,
        formatVersion: admin.totp_format_version,
      }, keyResult.key);
    } catch {
      return null;
    }
  }

  function adminDto(row) {
    const smtp = typeof getSmtpConfig === 'function' ? getSmtpConfig() : getSmtpConfig;
    return {
      id: row.id,
      username: row.username,
      email: row.email || null,
      emailPending: row.email_pending || null,
      emailVerified: Boolean(row.email_verified_at),
      smtpConfigured: Boolean(smtp?.enabled),
      totpEnabled: Boolean(row.totp_enabled),
      recoveryCodesRemaining: recovery.remaining(row.id),
      recoveryCodesGeneratedAt: row.recovery_codes_generated_at || null,
    };
  }

  async function verifyCurrentPassword(admin, currentPassword) {
    let params;
    try { params = JSON.parse(admin.password_params); } catch { params = null; }
    return verifyPassword(currentPassword || '', {
      algo: admin.password_algo,
      params,
      hash: admin.password_hash,
    });
  }

  return {
    adminDto,
    decryptTotpSecret,

    securityStatus() {
      const row = getAdmin.get();
      if (!row) return null;
      return adminDto(row);
    },

    /**
     * Post-setup / operator-triggered verification send (no password; caller must already be authenticated).
     * Does not claim success when SMTP is absent.
     */
    async sendVerificationForEmail(email) {
      const e = validateEmail(email);
      if (!e.ok) return { ok: false, code: 'VALIDATION_ERROR', message: e.message };
      const smtp = typeof getSmtpConfig === 'function' ? getSmtpConfig() : getSmtpConfig;
      if (!smtp?.enabled) {
        return { ok: false, code: 'SMTP_NOT_CONFIGURED', message: 'SMTP is not configured' };
      }
      const now = isoNow();
      setPendingEmail.run(e.email, now);
      const issued = emailOtp.issue(1, 'verify_email', e.email);
      try {
        await sendSmtpMail(smtp, {
          to: e.email,
          subject: 'Verify your administrator email',
          text: `Your verification code is ${issued.code}\n\nIt expires in 10 minutes.\nIf you did not request this, ignore this message.`,
        });
      } catch (err) {
        return { ok: false, code: err.code || 'SMTP_ERROR', message: 'Could not send verification email' };
      }
      logEvent?.('email_otp_sent', { username: getAdmin.get()?.username });
      return { ok: true };
    },

    async beginEmailEnrollment({ email, currentPassword, adminSession }, reqMeta = {}) {
      const admin = getAdmin.get();
      if (!admin) return { ok: false, http: 404, code: 'NOT_FOUND', message: 'Administrator not found' };
      const pwdOk = await verifyCurrentPassword(admin, currentPassword);
      if (!pwdOk) return { ok: false, http: 401, code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect' };

      const e = validateEmail(email);
      if (!e.ok) return { ok: false, http: 400, code: 'VALIDATION_ERROR', message: e.message };

      const smtp = typeof getSmtpConfig === 'function' ? getSmtpConfig() : getSmtpConfig;
      const now = isoNow();

      if (!smtp?.enabled) {
        // Store email as login identity without claiming verification.
        updateEmail.run(e.email, null, null, now);
        sessions.revokeAll(1);
        const session = sessions.create(1, { userAgent: reqMeta.userAgent, authLevel: 'full' });
        logEvent?.('email_enrolled_without_smtp', { username: admin.username });
        return {
          ok: true,
          http: 200,
          verificationRequired: false,
          admin: adminDto(getAdmin.get()),
          session,
          message: 'Email saved. SMTP is not configured, so the address is not marked verified.',
        };
      }

      setPendingEmail.run(e.email, now);
      const issued = emailOtp.issue(1, 'verify_email', e.email);
      try {
        await sendSmtpMail(smtp, {
          to: e.email,
          subject: 'Verify your administrator email',
          text: `Your verification code is ${issued.code}\n\nIt expires in 10 minutes.\nIf you did not request this, ignore this message.`,
        });
      } catch (err) {
        return {
          ok: false,
          http: 502,
          code: err.code || 'SMTP_ERROR',
          message: 'Could not send verification email. Check SMTP configuration.',
        };
      }
      logEvent?.('email_otp_sent', { username: admin.username });
      return {
        ok: true,
        http: 200,
        verificationRequired: true,
        admin: adminDto(getAdmin.get()),
        message: 'Verification code sent. Enter the code to confirm your email.',
      };
    },

    async verifyEmailOtp({ code }, reqMeta = {}) {
      const admin = getAdmin.get();
      if (!admin) return { ok: false, http: 404, code: 'NOT_FOUND', message: 'Administrator not found' };
      const rl = limiter?.check?.(sha256Hex(`email_otp|${admin.id}`), { max: 20 });
      if (rl && !rl.allowed) {
        return { ok: false, http: 429, code: 'RATE_LIMITED', message: 'Too many attempts', retryAfterSec: rl.retryAfterSec };
      }
      const result = emailOtp.verify(1, 'verify_email', code);
      if (!result.ok) {
        return { ok: false, http: 400, code: result.code, message: result.message };
      }
      const now = isoNow();
      updateEmail.run(result.email, now, null, now);
      logEvent?.('email_verified', { username: admin.username });
      return { ok: true, http: 200, admin: adminDto(getAdmin.get()) };
    },

    async resendEmailOtp() {
      const admin = getAdmin.get();
      const pending = admin?.email_pending || admin?.email;
      if (!pending) return { ok: false, http: 400, code: 'VALIDATION_ERROR', message: 'No email pending verification' };
      const smtp = typeof getSmtpConfig === 'function' ? getSmtpConfig() : getSmtpConfig;
      if (!smtp?.enabled) {
        return { ok: false, http: 503, code: 'SMTP_NOT_CONFIGURED', message: 'SMTP is not configured' };
      }
      const rl = limiter?.check?.(sha256Hex(`email_otp_resend|1`), { max: 5, windowMs: 15 * 60 * 1000 });
      if (rl && !rl.allowed) {
        return { ok: false, http: 429, code: 'RATE_LIMITED', message: 'Too many resend attempts', retryAfterSec: rl.retryAfterSec };
      }
      const issued = emailOtp.issue(1, 'verify_email', pending);
      try {
        await sendSmtpMail(smtp, {
          to: pending,
          subject: 'Verify your administrator email',
          text: `Your verification code is ${issued.code}\n\nIt expires in 10 minutes.`,
        });
      } catch {
        return { ok: false, http: 502, code: 'SMTP_ERROR', message: 'Could not send verification email' };
      }
      return { ok: true, http: 200, message: 'Verification code resent' };
    },

    async startTotpEnrollment({ currentPassword }) {
      const admin = getAdmin.get();
      if (!admin) return { ok: false, http: 404, code: 'NOT_FOUND', message: 'Administrator not found' };
      if (!(await verifyCurrentPassword(admin, currentPassword))) {
        return { ok: false, http: 401, code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect' };
      }
      const keyResult = requireKey();
      if (keyResult.error) {
        return {
          ok: false,
          http: 503,
          code: keyResult.error.code,
          message: 'DATA_ENCRYPTION_KEY is required to enroll authenticator MFA',
        };
      }
      const secret = generateTotpSecret();
      const enc = encryptSecret(secret, keyResult.key);
      const now = Date.now();
      upsertPendingTotp.run(
        enc.ciphertext,
        enc.nonce,
        enc.authTag,
        enc.formatVersion,
        isoNow(now),
        isoNow(now + 15 * 60 * 1000),
      );
      const account = admin.email || admin.username;
      return {
        ok: true,
        http: 200,
        secret,
        otpauthUrl: buildOtpAuthUri({ secret, accountName: account }),
        message: 'Scan the QR code or enter the secret, then confirm with a code from your authenticator.',
      };
    },

    async confirmTotpEnrollment({ code }) {
      const pending = getPendingTotp.get();
      if (!pending || pending.expires_at <= isoNow()) {
        return { ok: false, http: 400, code: 'TOTP_EXPIRED', message: 'Enrollment expired; start again' };
      }
      const keyResult = requireKey();
      if (keyResult.error) {
        return { ok: false, http: 503, code: keyResult.error.code, message: 'Encryption key unavailable' };
      }
      let secret;
      try {
        secret = decryptSecret({
          nonce: pending.nonce,
          ciphertext: pending.ciphertext,
          authTag: pending.auth_tag,
          formatVersion: pending.format_version,
        }, keyResult.key);
      } catch {
        return { ok: false, http: 500, code: 'DECRYPT_FAILED', message: 'Could not read enrollment secret' };
      }
      const used = new Set(loadUsedSteps.all(isoNow(Date.now() - 5 * 60 * 1000)).map((r) => r.step));
      const verified = verifyTotpCode(secret, code, { usedSteps: used });
      if (!verified.ok) {
        return { ok: false, http: 400, code: 'TOTP_INVALID', message: 'Invalid authenticator code' };
      }
      const now = isoNow();
      enableTotp.run(
        pending.ciphertext,
        pending.nonce,
        pending.auth_tag,
        pending.format_version,
        now,
        now,
      );
      clearPendingTotp.run();
      insertUsedStep.run(verified.step, now);
      const codes = generateRecoveryCodes(10);
      recovery.replaceAll(1, codes);
      sessions.revokeAll(1);
      logEvent?.('totp_enabled', { username: getAdmin.get()?.username });
      return {
        ok: true,
        http: 200,
        recoveryCodes: codes,
        admin: adminDto(getAdmin.get()),
        message: 'MFA enabled. Store recovery codes offline; they will not be shown again.',
      };
    },

    async disableTotp({ currentPassword, code }) {
      const admin = getAdmin.get();
      if (!admin?.totp_enabled) {
        return { ok: false, http: 400, code: 'TOTP_NOT_ENABLED', message: 'MFA is not enabled' };
      }
      if (!(await verifyCurrentPassword(admin, currentPassword))) {
        return { ok: false, http: 401, code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect' };
      }
      const secret = decryptTotpSecret(admin);
      if (!secret) {
        return { ok: false, http: 503, code: 'DECRYPT_FAILED', message: 'Could not verify authenticator' };
      }
      const used = new Set(loadUsedSteps.all(isoNow(Date.now() - 5 * 60 * 1000)).map((r) => r.step));
      const verified = verifyTotpCode(secret, code, { usedSteps: used });
      const recoveryOk = !verified.ok && recovery.consume(1, code);
      if (!verified.ok && !recoveryOk) {
        return { ok: false, http: 400, code: 'TOTP_INVALID', message: 'Invalid authenticator or recovery code' };
      }
      if (verified.ok) insertUsedStep.run(verified.step, isoNow());
      disableTotp.run(isoNow());
      clearPendingTotp.run();
      sessions.revokeAll(1);
      logEvent?.('totp_disabled', { username: admin.username });
      return { ok: true, http: 200, admin: adminDto(getAdmin.get()) };
    },

    async regenerateRecoveryCodes({ currentPassword, code }) {
      const admin = getAdmin.get();
      if (!admin?.totp_enabled) {
        return { ok: false, http: 400, code: 'TOTP_NOT_ENABLED', message: 'Enable MFA before generating recovery codes' };
      }
      if (!(await verifyCurrentPassword(admin, currentPassword))) {
        return { ok: false, http: 401, code: 'INVALID_CREDENTIALS', message: 'Current password is incorrect' };
      }
      const secret = decryptTotpSecret(admin);
      const used = new Set(loadUsedSteps.all(isoNow(Date.now() - 5 * 60 * 1000)).map((r) => r.step));
      const verified = secret ? verifyTotpCode(secret, code, { usedSteps: used }) : { ok: false };
      if (!verified.ok) {
        return { ok: false, http: 400, code: 'TOTP_INVALID', message: 'Invalid authenticator code' };
      }
      insertUsedStep.run(verified.step, isoNow());
      const codes = generateRecoveryCodes(10);
      recovery.replaceAll(1, codes);
      logEvent?.('recovery_codes_regenerated', { username: admin.username });
      return { ok: true, http: 200, recoveryCodes: codes };
    },

    /**
     * Complete MFA for a password-level session.
     */
    completeMfaChallenge({ sessionValidation, code }) {
      const admin = getAdmin.get();
      if (!admin?.totp_enabled) {
        return { ok: false, http: 400, code: 'TOTP_NOT_ENABLED', message: 'MFA is not enabled' };
      }
      const secret = decryptTotpSecret(admin);
      const used = new Set(loadUsedSteps.all(isoNow(Date.now() - 5 * 60 * 1000)).map((r) => r.step));
      let ok = false;
      if (secret) {
        const verified = verifyTotpCode(secret, code, { usedSteps: used });
        if (verified.ok) {
          insertUsedStep.run(verified.step, isoNow());
          ok = true;
        }
      }
      if (!ok) {
        ok = recovery.consume(1, code);
      }
      if (!ok) {
        return { ok: false, http: 401, code: 'MFA_INVALID', message: 'Invalid authentication code' };
      }
      sessions.promoteToFull(sessionValidation.sessionId);
      logEvent?.('mfa_ok', { username: admin.username });
      return {
        ok: true,
        http: 200,
        admin: adminDto(admin),
      };
    },

    /** Re-authenticate for destructive admin actions (cache delete, etc.). */
    async assertCurrentPassword(currentPassword) {
      const admin = getAdmin.get();
      if (!admin) {
        return { ok: false, code: 'NO_ADMIN', message: 'Administrator not found' };
      }
      const valid = await verifyCurrentPassword(admin, currentPassword);
      if (!valid) {
        return { ok: false, code: 'INVALID_PASSWORD', message: 'Current password is incorrect' };
      }
      return { ok: true };
    },

    /** Test helper */
    _peekTotpCode() {
      const admin = getAdmin.get();
      const secret = decryptTotpSecret(admin);
      if (!secret) return null;
      return generateTotpCode(secret).code;
    },
  };
}
