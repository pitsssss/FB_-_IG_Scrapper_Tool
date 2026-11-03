import { INSTAGRAM_LOGO_FALLBACK } from './instagramNormalize.js';
import { parseInstagramConfigRef } from './instagramRef.js';

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Accept only https:// logos (no downloads; URL shape only). */
export function isVerifiedHttpsLogoUrl(url) {
  const s = str(url);
  if (!s || s.length > 2000) return false;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:') return false;
    if (u.username || u.password) return false;
    if (!u.hostname || u.hostname === 'localhost' || u.hostname.endsWith('.local')) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse INSTAGRAM_PROFILE_LOGOS JSON map: { "nasa": "https://…", "https://instagram.com/x/": "https://…" }
 * Keys normalize to lowercase Instagram usernames. Invalid entries throw at startup.
 */
export function parseInstagramProfileLogos(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return new Map();
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    throw new Error('INSTAGRAM_PROFILE_LOGOS must be valid JSON object of username → HTTPS logo URL');
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new Error('INSTAGRAM_PROFILE_LOGOS must be a JSON object');
  }
  const out = new Map();
  for (const [k, v] of Object.entries(obj)) {
    const ref = parseInstagramConfigRef(String(k));
    if (!ref) throw new Error(`INSTAGRAM_PROFILE_LOGOS has invalid Instagram username/URL key: ${k}`);
    if (!isVerifiedHttpsLogoUrl(v)) {
      throw new Error(`INSTAGRAM_PROFILE_LOGOS[${k}] must be an https:// URL without credentials`);
    }
    out.set(ref.username, String(v).trim());
  }
  return out;
}

/**
 * Owner profile picture from post Actor rows only.
 * Never uses coauthorProducers, comments, tagged users, or collaborator avatars.
 */
export function extractOwnerLogoFromItems(items, ref) {
  const username = ref?.username;
  if (!username || !Array.isArray(items)) return null;
  const counts = new Map();
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const owner = str(it.ownerUsername || it.owner?.username)?.toLowerCase();
    if (owner !== username) continue;
    const candidates = [
      it.ownerProfilePicUrl,
      it.owner?.profile_pic_url,
      it.owner?.profilePicUrl,
      // Intentionally omit it.profilePicUrl / coauthorProducers[].profile_pic_url
    ];
    for (const c of candidates) {
      if (!isVerifiedHttpsLogoUrl(c)) continue;
      const s = str(c);
      counts.set(s, (counts.get(s) || 0) + 1);
    }
  }
  let best = null;
  let bestCount = 0;
  for (const [url, n] of counts) {
    if (n > bestCount) {
      best = url;
      bestCount = n;
    }
  }
  return best;
}

export function logoFromProfileMeta(meta, ref) {
  if (!meta || !ref?.username) return null;
  const u = str(meta.username)?.toLowerCase();
  if (u !== ref.username) return null;
  const pic = pickHttps(meta.profilePicUrlHD, meta.profilePicUrl, meta.profile_pic_url_hd, meta.profile_pic_url);
  return pic;
}

function pickHttps(...vals) {
  for (const v of vals) {
    if (isVerifiedHttpsLogoUrl(v)) return str(v);
  }
  return null;
}

/**
 * Priority (STEP 6C):
 * 1. Genuine owner image from post Actor data
 * 2. Verified cached profile metadata
 * 3. Explicit company-configured HTTPS logo
 * 4. Documented generic fallback
 */
export function resolveInstagramLogo({
  fromPosts = null,
  fromProfileMeta = null,
  fromConfig = null,
} = {}) {
  if (isVerifiedHttpsLogoUrl(fromPosts)) return { logo: str(fromPosts), source: 'posts' };
  if (isVerifiedHttpsLogoUrl(fromProfileMeta)) return { logo: str(fromProfileMeta), source: 'profile-meta' };
  if (isVerifiedHttpsLogoUrl(fromConfig)) return { logo: str(fromConfig), source: 'config' };
  return { logo: INSTAGRAM_LOGO_FALLBACK, source: 'fallback' };
}

export function applyResolvedLogoToPage(page, logo) {
  return {
    ...page,
    logo,
    logo_fallback: INSTAGRAM_LOGO_FALLBACK,
  };
}
