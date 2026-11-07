import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

/** Interactive login parameters (memory-hard scrypt). Tunable via stored params for future migration. */
export const SCRYPT_DEFAULTS = {
  algo: 'scrypt',
  N: 16384,
  r: 8,
  p: 1,
  keylen: 32,
  saltBytes: 16,
  maxmem: 64 * 1024 * 1024,
};

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,64}$/;

export function validateUsername(username) {
  if (typeof username !== 'string') return { ok: false, message: 'Username is required' };
  const u = username.trim();
  if (!USERNAME_RE.test(u)) {
    return { ok: false, message: 'Username must be 3–64 characters (letters, digits, . _ -)' };
  }
  return { ok: true, username: u.toLowerCase() };
}

export function validatePassword(password) {
  if (typeof password !== 'string') return { ok: false, message: 'Password is required' };
  if (password.length < 12) return { ok: false, message: 'Password must be at least 12 characters' };
  if (password.length > 200) return { ok: false, message: 'Password is too long' };
  return { ok: true };
}

/**
 * Hash a password with scrypt. Returns { hash: hex, algo, params }.
 * Chosen over Argon2id for this phase to avoid native addons in the
 * zero-npm-install Docker image; parameters are stored for future KDF migration.
 */
export async function hashPassword(password, overrides = {}) {
  const params = { ...SCRYPT_DEFAULTS, ...overrides };
  const salt = randomBytes(params.saltBytes);
  const derived = await scryptAsync(password, salt, params.keylen, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: params.maxmem,
  });
  return {
    algo: params.algo,
    params: {
      N: params.N,
      r: params.r,
      p: params.p,
      keylen: params.keylen,
      salt: salt.toString('base64'),
      maxmem: params.maxmem,
    },
    hash: Buffer.from(derived).toString('base64'),
  };
}

export async function verifyPassword(password, record) {
  if (!record || record.algo !== 'scrypt' || !record.params || !record.hash) return false;
  const { N, r, p, keylen, salt, maxmem } = record.params;
  if (!salt || !keylen) return false;
  let saltBuf;
  let expected;
  try {
    saltBuf = Buffer.from(salt, 'base64');
    expected = Buffer.from(record.hash, 'base64');
  } catch {
    return false;
  }
  const derived = await scryptAsync(password, saltBuf, keylen, {
    N,
    r,
    p,
    maxmem: maxmem || SCRYPT_DEFAULTS.maxmem,
  });
  const actual = Buffer.from(derived);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}
