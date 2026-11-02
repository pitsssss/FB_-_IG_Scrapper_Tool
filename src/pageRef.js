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

const safeDecode = (s) => {
  try { return decodeURIComponent(s); } catch { return s; }
};

/**
 * Parses a Facebook page URL into a canonical reference.
 * Returns null when the input is not a supported Facebook page URL.
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
  if (!HOSTS.has(u.hostname.toLowerCase())) return null;

  const seg = u.pathname.split('/').filter(Boolean).map(safeDecode);
  if (!seg.length) return null;
  const first = seg[0].toLowerCase();

  if (first === 'profile.php') {
    const id = u.searchParams.get('id');
    if (!id || !/^\d{5,25}$/.test(id)) return null;
    return { key: id, id, slug: null, url: `https://www.facebook.com/profile.php?id=${id}` };
  }

  if (first === 'pages' || first === 'people') {
    const id = [...seg].reverse().find((s) => /^\d{5,25}$/.test(s));
    if (!id) return null;
    return { key: id, id, slug: null, url: `https://www.facebook.com/${seg[0]}/${encodeURIComponent(seg[1] || 'page')}/${id}` };
  }

  if (RESERVED.has(first) || !/^[A-Za-z0-9._-]{2,100}$/.test(seg[0])) return null;
  const slug = seg[0];
  const numeric = /^\d{5,25}$/.test(slug) ? slug : null;
  return { key: slug.toLowerCase(), id: numeric, slug: numeric ? null : slug, url: `https://www.facebook.com/${slug}` };
}
