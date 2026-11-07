import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function sha256Hex(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

export function sha256Buffer(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : value).digest();
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString('base64url');
}

export function safeEqualString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Compare two secrets by hashing first (constant-length digests). */
export function safeEqualSecret(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ha = sha256Buffer(a);
  const hb = sha256Buffer(b);
  return timingSafeEqual(ha, hb);
}

export function isoNow(ms = Date.now()) {
  return new Date(ms).toISOString();
}
