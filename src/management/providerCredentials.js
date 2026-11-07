import { encryptSecret, decryptSecret, parseDataEncryptionKey } from './cryptoBox.js';
import { verifyApifyToken } from './apifyVerify.js';
import { isoNow } from './cryptoUtil.js';

/**
 * Persist and activate encrypted Apify credentials.
 */
export function createProviderCredentialService(db, {
  runtime,
  getEncryptionKey = () => process.env.DATA_ENCRYPTION_KEY || '',
  verifyOpts = {},
} = {}) {
  const getRow = db.prepare('SELECT * FROM provider_credentials WHERE id = 1');
  const upsert = db.prepare(`
    INSERT INTO provider_credentials (
      id, provider, status, format_version, key_version,
      ciphertext, nonce, auth_tag, username_hint,
      last_verified_at, last_verify_ok, last_verify_code,
      disconnected_at, created_at, updated_at
    ) VALUES (
      1, 'apify', @status, @format_version, @key_version,
      @ciphertext, @nonce, @auth_tag, @username_hint,
      @last_verified_at, @last_verify_ok, @last_verify_code,
      @disconnected_at, @created_at, @updated_at
    )
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      format_version = excluded.format_version,
      key_version = excluded.key_version,
      ciphertext = excluded.ciphertext,
      nonce = excluded.nonce,
      auth_tag = excluded.auth_tag,
      username_hint = excluded.username_hint,
      last_verified_at = excluded.last_verified_at,
      last_verify_ok = excluded.last_verify_ok,
      last_verify_code = excluded.last_verify_code,
      disconnected_at = excluded.disconnected_at,
      updated_at = excluded.updated_at
  `);

  function requireKey() {
    try {
      return { key: parseDataEncryptionKey(getEncryptionKey()) };
    } catch (err) {
      return { error: err };
    }
  }

  function loadIntoRuntime() {
    const row = getRow.get();
    if (!row) {
      runtime.applyManagedState({ status: 'none' });
      return { ok: true, status: 'none' };
    }
    if (row.status === 'disconnected') {
      runtime.applyManagedState({
        status: 'disconnected',
        usernameHint: null,
        lastVerifiedAt: row.last_verified_at,
        lastVerifyOk: row.last_verify_ok === 1,
        lastVerifyCode: row.last_verify_code,
      });
      return { ok: true, status: 'disconnected' };
    }
    if (row.status !== 'active' || !row.ciphertext) {
      runtime.applyManagedState({
        status: row.status || 'invalid',
        lastVerifiedAt: row.last_verified_at,
        lastVerifyOk: row.last_verify_ok === 1,
        lastVerifyCode: row.last_verify_code,
        usernameHint: row.username_hint,
      });
      return { ok: true, status: row.status };
    }

    const keyResult = requireKey();
    if (keyResult.error) {
      runtime.applyManagedState({
        status: 'invalid',
        usernameHint: row.username_hint,
        lastVerifiedAt: row.last_verified_at,
        lastVerifyOk: false,
        lastVerifyCode: keyResult.error.code || 'ENCRYPTION_KEY_MISSING',
      });
      return { ok: false, code: keyResult.error.code, message: keyResult.error.message };
    }

    try {
      const token = decryptSecret({
        nonce: row.nonce,
        ciphertext: row.ciphertext,
        authTag: row.auth_tag,
        formatVersion: row.format_version,
      }, keyResult.key);
      runtime.setActiveToken(token, {
        usernameHint: row.username_hint,
        lastVerifiedAt: row.last_verified_at,
      });
      return { ok: true, status: 'active' };
    } catch (err) {
      runtime.applyManagedState({
        status: 'invalid',
        usernameHint: row.username_hint,
        lastVerifiedAt: row.last_verified_at,
        lastVerifyOk: false,
        lastVerifyCode: err.code || 'DECRYPT_FAILED',
      });
      return { ok: false, code: err.code || 'DECRYPT_FAILED', message: 'Stored credential could not be decrypted' };
    }
  }

  return {
    loadIntoRuntime,

    status() {
      return runtime.getStatus();
    },

    async validate(token) {
      return verifyApifyToken(token, verifyOpts);
    },

    async connect(token, { adminUsername } = {}) {
      const keyResult = requireKey();
      if (keyResult.error) {
        return {
          ok: false,
          http: 503,
          code: keyResult.error.code,
          message: 'Set DATA_ENCRYPTION_KEY (base64-encoded 32 bytes) before saving provider credentials',
        };
      }

      const verified = await verifyApifyToken(token, verifyOpts);
      if (!verified.ok) {
        return {
          ok: false,
          http: verified.code === 'NETWORK_TIMEOUT' || verified.code === 'NETWORK_ERROR' ? 502 : 400,
          code: verified.code,
          message: verified.message,
        };
      }

      const enc = encryptSecret(token.trim(), keyResult.key);
      const now = isoNow();
      db.exec('BEGIN IMMEDIATE;');
      try {
        upsert.run({
          status: 'active',
          format_version: enc.formatVersion,
          key_version: 1,
          ciphertext: enc.ciphertext,
          nonce: enc.nonce,
          auth_tag: enc.authTag,
          username_hint: verified.usernameHint,
          last_verified_at: now,
          last_verify_ok: 1,
          last_verify_code: 'ok',
          disconnected_at: null,
          created_at: now,
          updated_at: now,
        });
        db.exec('COMMIT;');
      } catch (err) {
        try { db.exec('ROLLBACK;'); } catch { /* ignore */ }
        throw err;
      }

      runtime.setActiveToken(token.trim(), {
        usernameHint: verified.usernameHint,
        lastVerifiedAt: now,
      });

      return {
        ok: true,
        http: 200,
        status: runtime.getStatus(),
        audit: {
          event: 'provider_connected',
          adminUsername,
          targetType: 'provider',
          targetId: 'apify',
          outcome: 'ok',
          meta: { usernameHint: verified.usernameHint },
        },
      };
    },

    async disconnect({ adminUsername } = {}) {
      const now = isoNow();
      const existing = getRow.get();
      db.exec('BEGIN IMMEDIATE;');
      try {
        upsert.run({
          status: 'disconnected',
          format_version: existing?.format_version || 1,
          key_version: existing?.key_version || 1,
          ciphertext: null,
          nonce: null,
          auth_tag: null,
          username_hint: null,
          last_verified_at: existing?.last_verified_at || null,
          last_verify_ok: existing?.last_verify_ok ?? null,
          last_verify_code: existing?.last_verify_code || null,
          disconnected_at: now,
          created_at: existing?.created_at || now,
          updated_at: now,
        });
        db.exec('COMMIT;');
      } catch (err) {
        try { db.exec('ROLLBACK;'); } catch { /* ignore */ }
        throw err;
      }
      runtime.setDisconnected();
      return {
        ok: true,
        http: 200,
        status: runtime.getStatus(),
        audit: {
          event: 'provider_disconnected',
          adminUsername,
          targetType: 'provider',
          targetId: 'apify',
          outcome: 'ok',
        },
      };
    },
  };
}
