import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(bytes = 20) {
  return base32Encode(randomBytes(bytes));
}

export function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(str) {
  const cleaned = String(str).toUpperCase().replace(/=+$/g, '').replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secretBuf, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', secretBuf).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code = ((hmac[offset] & 0x7f) << 24)
    | ((hmac[offset + 1] & 0xff) << 16)
    | ((hmac[offset + 2] & 0xff) << 8)
    | (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

/** RFC 6238 TOTP (SHA-1, 30s, 6 digits). */
export function generateTotpCode(secretBase32, { nowMs = Date.now(), stepSec = 30 } = {}) {
  const secret = base32Decode(secretBase32);
  const step = Math.floor(nowMs / 1000 / stepSec);
  return { code: hotp(secret, step), step };
}

export function verifyTotpCode(secretBase32, code, {
  nowMs = Date.now(),
  stepSec = 30,
  window = 1,
  usedSteps,
} = {}) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) return { ok: false, reason: 'format' };
  const presented = code.trim();
  const secret = base32Decode(secretBase32);
  const current = Math.floor(nowMs / 1000 / stepSec);
  for (let w = -window; w <= window; w += 1) {
    const step = current + w;
    if (usedSteps?.has?.(step)) continue;
    const expected = hotp(secret, step);
    const a = Buffer.from(expected);
    const b = Buffer.from(presented);
    if (a.length === b.length && timingSafeEqual(a, b)) {
      return { ok: true, step };
    }
  }
  return { ok: false, reason: 'mismatch' };
}

export function buildOtpAuthUri({ secret, accountName, issuer = 'Social Media Posts API' }) {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
