const HOSTS = new Set([
  'facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com',
  'mbasic.facebook.com', 'fb.com', 'www.fb.com',
]);

// First path segments that are NOT page names.
const RESERVED = new Set([
  'groups', 'watch', 'events', 'marketplace', 'sharer', 'sharer.php', 'share', 'share.php',
  'l.php', 'permalink.php', 'story.php', 'photo', 'photo.php', 'photos', 'video', 'videos',
  'reel', 'reels', 'stories', 'hashtag', 'login', 'login.php', 'dialog', 'plugins', 'tr',
  'policies', 'help', 'gaming', 'search', 'public', 'p', 'friends', 'home.php', 'bookmarks',
]);

const FB_USERNAME_RE = /^[A-Za-z0-9._-]{2,100}$/;

const safeDecode = (s) => {
  try { return decodeURIComponent(s); } catch { return s; }
};

/**
 * True when the public API must reject the value as a URL / path (not a bare username).
 */
export function looksLikeSocialUrlOrPath(input) {
  if (typeof input !== 'string') return true;
  const raw = input.trim();
  if (!raw) return false;
  if (/[\u0000-\u001F\u007F]/.test(raw)) return true;
  if (/\s/.test(raw)) return true;
  if (raw.startsWith('@')) return true;
  if (raw.includes('://')) return true;
  if (/^https?:\/\//i.test(raw)) return true;
  if (raw.includes('/') || raw.includes('\\')) return true;
  if (raw.includes('?') || raw.includes('#') || raw.includes('%')) return true;
  if (/^(www\.)?(facebook|fb|instagram)\.com\b/i.test(raw)) return true;
  if (/^[a-z0-9.-]+\.[a-z]{2,}([/:?#]|$)/i.test(raw)) return true;
  return false;
}

function facebookRefFromSlug(slug) {
  const lower = slug.toLowerCase();
  if (RESERVED.has(lower)) return null;
  if (!FB_USERNAME_RE.test(slug)) return null;
  if (/^\.+$/.test(slug)) return null;
  const numeric = /^\d{5,25}$/.test(slug) ? slug : null;
  return {
    platform: 'facebook',
    key: lower,
    id: numeric,
    slug: numeric ? null : slug,
    username: lower,
    url: `https://www.facebook.com/${lower}`,
  };
}

/**
 * Public Facebook API input: bare page username / numeric id only.
 * Full Facebook URLs are rejected (return null).
 */
export function parseFacebookUsername(input) {
  if (typeof input !== 'string' || !input.trim()) return null;
  const raw = input.trim();
  if (raw.length > 100) return null;
  if (looksLikeSocialUrlOrPath(raw)) return null;
  return facebookRefFromSlug(raw);
}

/**
 * Trusted / legacy Facebook page URL parser (config, warmers, fixtures).
 * Returns null when the input is not a supported Facebook page URL.
 * Not used for public HTTP `page` query values.
 */
export function parsePageRef(input) {
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
  if (!HOSTS.has(u.hostname.toLowerCase())) return null;

  const seg = u.pathname.split('/').filter(Boolean).map(safeDecode);
  if (!seg.length) return null;
  const first = seg[0].toLowerCase();

  if (first === 'profile.php') {
    const id = u.searchParams.get('id');
    if (!id || !/^\d{5,25}$/.test(id)) return null;
    return {
      platform: 'facebook',
      key: id,
      id,
      slug: null,
      username: id,
      url: `https://www.facebook.com/profile.php?id=${id}`,
    };
  }

  if (first === 'pages' || first === 'people') {
    const id = [...seg].reverse().find((s) => /^\d{5,25}$/.test(s));
    if (!id) return null;
    return {
      platform: 'facebook',
      key: id,
      id,
      slug: null,
      username: id,
      url: `https://www.facebook.com/${seg[0]}/${encodeURIComponent(seg[1] || 'page')}/${id}`,
    };
  }

  if (RESERVED.has(first)) return null;
  return facebookRefFromSlug(seg[0]);
}

/**
 * Trusted config helper: username, facebook:username, or legacy page URL.
 */
export function parseFacebookConfigRef(input) {
  if (typeof input !== 'string' || !input.trim()) return null;
  const raw = input.trim();
  const prefixed = /^facebook:(.+)$/i.exec(raw);
  if (prefixed) return parseFacebookUsername(prefixed[1]);
  return parseFacebookUsername(raw) || parsePageRef(raw);
}
