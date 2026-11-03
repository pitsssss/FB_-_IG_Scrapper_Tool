const HOSTS = new Set([
  'instagram.com',
  'www.instagram.com',
  'm.instagram.com',
]);

/** First path segments that are NOT profile usernames. */
const RESERVED = new Set([
  'p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'direct', 'tv',
  'tags', 'directory', 'developer', 'about', 'legal', 'privacy', 'safety',
  'api', 'graphql', 'web', 'static', 'images', 'login', 'emailsignup',
  'nametag', 'session', 'push', 'popular', 'guide', 'guides',
]);

const USERNAME_RE = /^[A-Za-z0-9._]{1,30}$/;

const safeDecode = (s) => {
  try { return decodeURIComponent(s); } catch { return s; }
};

/**
 * Parses an Instagram profile URL into a platform-aware reference.
 * Cache key is always prefixed: `instagram:<username>` (never collides with Facebook keys).
 * Returns null when the input is not a supported Instagram profile URL.
 *
 * @returns {{ platform: 'instagram', key: string, username: string, url: string } | null}
 */
export function parseInstagramRef(input) {
  if (typeof input !== 'string' || !input.trim() || input.length > 500) return null;
  const raw = input.trim();

  let u;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  if (!HOSTS.has(host)) return null;

  // Fragments must not affect identity; ignore hash. Strip tracking query params by not using them.
  const seg = u.pathname.split('/').filter(Boolean).map(safeDecode);
  if (!seg.length) return null;
  if (seg.length > 1) {
    // Allow trailing empty only; reject /user/tagged, /user/reels, etc.
    return null;
  }

  const user = seg[0];
  const lower = user.toLowerCase();
  if (RESERVED.has(lower)) return null;
  if (!USERNAME_RE.test(user)) return null;
  // Instagram usernames cannot be only dots.
  if (/^\.+$/.test(user)) return null;

  const username = lower;
  return {
    platform: 'instagram',
    key: `instagram:${username}`,
    username,
    url: `https://www.instagram.com/${username}/`,
  };
}

export function isInstagramRef(ref) {
  return Boolean(ref && (ref.platform === 'instagram' || (typeof ref.key === 'string' && ref.key.startsWith('instagram:'))));
}
