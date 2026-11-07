import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const CRYPTO_FORMAT_VERSION = 1;
const ALGO = 'aes-256-gcm';
const NONCE_BYTES = 12;
const KEY_BYTES = 32;

/**
 * Parse DATA_ENCRYPTION_KEY: base64-encoded 32 bytes.
 * @returns {Buffer}
 */
export function parseDataEncryptionKey(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    const err = new Error('DATA_ENCRYPTION_KEY is not configured');
    err.code = 'ENCRYPTION_KEY_MISSING';
    throw err;
  }
  let buf;
  try {
    buf = Buffer.from(String(raw).trim(), 'base64');
  } catch {
    const err = new Error('DATA_ENCRYPTION_KEY must be base64-encoded');
    err.code = 'ENCRYPTION_KEY_INVALID';
    throw err;
  }
  if (buf.length !== KEY_BYTES) {
    const err = new Error('DATA_ENCRYPTION_KEY must decode to exactly 32 bytes');
    err.code = 'ENCRYPTION_KEY_INVALID';
    throw err;
  }
  return buf;
}

/**
 * Encrypt plaintext with AES-256-GCM.
 * @returns {{ formatVersion: number, nonce: Buffer, ciphertext: Buffer, authTag: Buffer }}
 */
export function encryptSecret(plaintext, key) {
  if (typeof plaintext !== 'string' || !plaintext) {
    throw new Error('plaintext is required');
  }
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv(ALGO, key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    formatVersion: CRYPTO_FORMAT_VERSION,
    nonce,
    ciphertext,
    authTag,
  };
}

/**
 * Decrypt AES-256-GCM payload. Rejects tampering / wrong key.
 */
export function decryptSecret({ nonce, ciphertext, authTag, formatVersion }, key) {
  if (formatVersion !== CRYPTO_FORMAT_VERSION) {
    const err = new Error('Unsupported encryption format');
    err.code = 'ENCRYPTION_FORMAT';
    throw err;
  }
  const n = Buffer.isBuffer(nonce) ? nonce : Buffer.from(nonce);
  const c = Buffer.isBuffer(ciphertext) ? ciphertext : Buffer.from(ciphertext);
  const t = Buffer.isBuffer(authTag) ? authTag : Buffer.from(authTag);
  try {
    const decipher = createDecipheriv(ALGO, key, n);
    decipher.setAuthTag(t);
    return Buffer.concat([decipher.update(c), decipher.final()]).toString('utf8');
  } catch {
    const err = new Error('Credential decryption failed');
    err.code = 'DECRYPT_FAILED';
    throw err;
  }
}
