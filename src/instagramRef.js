import { looksLikeSocialUrlOrPath } from './pageRef.js';

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

function instagramRefFromUsername(user) {
  const lower = user.toLowerCase();
  if (RESERVED.has(lower)) return null;
  if (!USERNAME_RE.test(user)) return null;
  if (/^\.+$/.test(user)) return null;
  return {
    platform: 'instagram',
    key: `instagram:${lower}`,
    username: lower,
    url: `https://www.instagram.com/${lower}/`,
  };
}

/**
 * Public Instagram API input: bare profile username only.
 * Full Instagram URLs are rejected (return null).
 */
export function parseInstagramUsername(input) {
  if (typeof input !== 'string' || !input.trim()) return null;
  const raw = input.trim();
  if (raw.length > 30) return null;
  if (looksLikeSocialUrlOrPath(raw)) return null;
  // Instagram usernames cannot contain '-' (unlike Facebook).
  if (raw.includes('-')) return null;
  return instagramRefFromUsername(raw);
}

/**
 * Trusted / legacy Instagram profile URL parser (config, warmers, fixtures).
 * Returns null when the input is not a supported Instagram profile URL.
 * Not used for public HTTP `page` query values.
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

  const seg = u.pathname.split('/').filter(Boolean).map(safeDecode);
  if (!seg.length) return null;
  if (seg.length > 1) return null;

  return instagramRefFromUsername(seg[0]);
}

/**
 * Trusted config helper: username, instagram:username, or legacy profile URL.
 */
export function parseInstagramConfigRef(input) {
  if (typeof input !== 'string' || !input.trim()) return null;
  const raw = input.trim();
  const prefixed = /^instagram:(.+)$/i.exec(raw);
  if (prefixed) {
    // Allow "instagram:nasa" where the remainder is a bare username (not a URL).
    return parseInstagramUsername(prefixed[1]);
  }
  return parseInstagramUsername(raw) || parseInstagramRef(raw);
}

export function isInstagramRef(ref) {
  return Boolean(ref && (ref.platform === 'instagram' || (typeof ref.key === 'string' && ref.key.startsWith('instagram:'))));
}
