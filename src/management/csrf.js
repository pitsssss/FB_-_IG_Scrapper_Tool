/**
 * Origin / CSRF helpers for cookie-authenticated admin mutations.
 */

function parseOrigin(value) {
  if (!value || typeof value !== 'string') return null;
  try {
    const u = new URL(value);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/**
 * Build allowed origin set from ADMIN_ALLOWED_ORIGINS (comma-separated).
 * No wildcards. Empty → deny cross-origin (same-origin via Origin/Referer match to request host only when explicitly configured).
 */
export function parseAllowedOrigins(envValue) {
  if (!envValue || typeof envValue !== 'string') return [];
  return envValue
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(parseOrigin)
    .filter(Boolean);
}

/**
 * Validate Origin (preferred) or Referer against allow-list.
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validateOrigin(headers, allowedOrigins) {
  const origin = headers.origin || headers.Origin;
  const referer = headers.referer || headers.Referer;
  const candidate = parseOrigin(origin) || parseOrigin(referer);
  if (!candidate) {
    return { ok: false, reason: 'missing_origin' };
  }
  if (!allowedOrigins.length) {
    return { ok: false, reason: 'no_allowed_origins' };
  }
  if (!allowedOrigins.includes(candidate)) {
    return { ok: false, reason: 'origin_denied' };
  }
  return { ok: true, origin: candidate };
}

/**
 * Resolve client IP for rate limiting without trusting arbitrary X-Forwarded-For
 * unless TRUST_PROXY=1 and a single hop is expected.
 */
export function resolveClientIp(req, { trustProxy = false } = {}) {
  const socketIp = req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
  if (!trustProxy) return socketIp;
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) {
    // Right-most / first depending on proxy; use left-most only when operator opted in.
    return xf.split(',')[0].trim() || socketIp;
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) return realIp.trim();
  return socketIp;
}
