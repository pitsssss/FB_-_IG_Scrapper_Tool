import { createHash } from 'node:crypto';

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const pick = (...vals) => {
  for (const v of vals) {
    const s = str(v);
    if (s) return s;
  }
  return null;
};

/**
 * Generic schema-compliant logo when the Actor does not expose the owner's profile picture.
 * Live acceptance (2026-11-03, nasa, dataDetailLevel=basicData): ownerProfilePicUrl was absent on
 * all rows — logo correctly used this fallback (not a real profile photo).
 * Never use commenter avatars / coauthors as the account logo.
 * Future enrichment: a separate profile Actor or detailedData (paid) — not enabled by default.
 */
export const INSTAGRAM_LOGO_FALLBACK = 'https://www.instagram.com/static/images/anonymousUser.jpg';

function num(v) {
  if (v === -1 || v === '-1') return 0; // Actor: hidden likes → -1 (unavailable)
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.trunc(v));
  if (typeof v === 'string') {
    const m = v.trim().replace(/,/g, '').match(/^(\d+(?:\.\d+)?)\s*([kKmM])?$/);
    if (m) {
      const mult = m[2] ? (m[2].toLowerCase() === 'k' ? 1e3 : 1e6) : 1;
      return Math.round(Number(m[1]) * mult);
    }
  }
  return 0;
}

function toIso(v) {
  if (v === null || v === undefined || v === '') return null;
  let d;
  if (typeof v === 'number' || (typeof v === 'string' && /^\d+$/.test(v))) {
    const n = Number(v);
    d = new Date(n < 1e12 ? n * 1000 : n);
  } else {
    d = new Date(v);
  }
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function isErrorRecord(item) {
  return Boolean(item && (item.error || item.errorDescription || item.errorBody));
}

function majorityVote(values) {
  const counts = new Map();
  for (const v of values) {
    const s = str(v);
    if (!s) continue;
    counts.set(s, (counts.get(s) || 0) + 1);
  }
  let best = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

function ownerMatchesRef(item, ref) {
  const u = pick(item.ownerUsername, item.owner?.username)?.toLowerCase();
  return Boolean(u && ref.username && u === ref.username);
}

/**
 * True when Actor marks Sidecar/carousel but provides no child media arrays.
 * Live NASA basicData (2026-11-03): Sidecar rows had displayUrl only — incomplete.
 */
export function isIncompleteCarousel(item) {
  if (!item || typeof item !== 'object') return false;
  const type = String(item.type || '').toLowerCase();
  if (type !== 'sidecar' && type !== 'carousel') return false;
  const children = Array.isArray(item.childPosts) ? item.childPosts : [];
  const images = Array.isArray(item.images) ? item.images : [];
  return children.length === 0 && images.length === 0;
}

/**
 * Extract media from an Instagram Actor post item (image / video / carousel).
 * Does not pull commenter/coauthor profile pictures into media.
 *
 * Complete carousels: prefer childPosts order (then images[]), dedupe URLs, keep video thumbnails.
 * Incomplete Sidecar (basicData): keep verified cover displayUrl/videoUrl only — never invent children.
 */
export function extractInstagramMedia(item) {
  const out = [];
  const seen = new Set();
  const add = (type, url, thumbnail = null) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ type, url, thumbnail });
  };

  const type = String(item.type || '').toLowerCase();
  const display = pick(item.displayUrl, item.display_url);
  const video = pick(item.videoUrl, item.video_url);
  const images = Array.isArray(item.images) ? item.images : [];
  const children = Array.isArray(item.childPosts) ? item.childPosts : [];
  const incomplete = isIncompleteCarousel(item);

  // Complete carousel: expand children first (preserve Actor order), then images[].
  if (!incomplete && (children.length || images.length)) {
    for (const child of children) {
      if (!child || typeof child !== 'object') continue;
      const cVid = pick(child.videoUrl, child.video_url);
      const cDisp = pick(child.displayUrl, child.display_url);
      if (cVid) add('video', cVid, cDisp);
      else if (cDisp) add('image', cDisp);
    }
    for (const u of images) {
      if (typeof u === 'string') add('image', u);
      else if (u && typeof u === 'object') add('image', pick(u.url, u.displayUrl, u.src));
    }
    // Cover may duplicate first child — add only if unique.
    if (video) add('video', video, display);
    else if (display) add('image', display);
    return out;
  }

  // Single image / video / incomplete Sidecar cover only.
  if (video) {
    add('video', video, display);
  } else if (display) {
    add('image', display);
  }

  return out;
}

function collectAccountIdentity(items, ref) {
  const authored = items.filter((it) => ownerMatchesRef(it, ref));
  const pool = authored.length ? authored : items;

  const name =
    majorityVote(pool.map((it) => it.ownerFullName))
    || majorityVote(pool.map((it) => it.ownerUsername))
    || ref.username;

  // Only requested-owner profile pictures — never commenters, tagged users, or coauthorProducers.
  const logo =
    majorityVote(pool.flatMap((it) => {
      if (!ownerMatchesRef(it, ref)) return [];
      return [
        it.ownerProfilePicUrl,
        it.owner?.profile_pic_url,
        it.owner?.profilePicUrl,
      ];
    }))
    || INSTAGRAM_LOGO_FALLBACK;

  const id =
    majorityVote(pool.map((it) => (it.ownerId != null ? String(it.ownerId) : null)))
    || majorityVote(pool.map((it) => (it.owner?.id != null ? String(it.owner.id) : null)))
    || null;

  return {
    id,
    name,
    logo,
    logo_fallback: INSTAGRAM_LOGO_FALLBACK,
    url: ref.url,
  };
}

/**
 * Normalize Apify Instagram Post Scraper dataset items into the public API schema.
 * Instagram shares are not provided by the Actor → stats.shares is always 0.
 */
export function normalizeInstagramItems(rawItems, ref, limit = 10) {
  const items = (Array.isArray(rawItems) ? rawItems : []).filter(
    (x) => x && typeof x === 'object' && !isErrorRecord(x),
  );

  const page = collectAccountIdentity(items, ref);
  const seen = new Set();
  const posts = [];

  items.forEach((it, index) => {
    const shortCode = pick(it.shortCode, it.shortcode);
    const url = pick(
      it.url,
      shortCode ? `https://www.instagram.com/p/${shortCode}/` : null,
    );
    const rawId = it.id ?? shortCode;
    const id = rawId !== undefined && rawId !== null && String(rawId)
      ? String(rawId)
      : (url ? createHash('sha1').update(url).digest('hex').slice(0, 16) : null);
    if (!id || seen.has(id)) return;

    const text = pick(it.caption, it.text) || '';
    const media = extractInstagramMedia(it);
    if (!text && !media.length && !url) return;

    seen.add(id);
    const createdAt = toIso(it.timestamp ?? it.takenAt ?? it.taken_at ?? it.date);
    const likesRaw = it.likesCount ?? it.likes;
    posts.push({
      _order: index,
      _ts: createdAt ? Date.parse(createdAt) : null,
      _pinned: Boolean(it.isPinned ?? it.is_pinned),
      id,
      url: url || null,
      text,
      created_at: createdAt,
      image: media.find((m) => m.type === 'image')?.url
        || media.find((m) => m.thumbnail)?.thumbnail
        || null,
      media,
      stats: {
        likes: num(likesRaw),
        comments: num(it.commentsCount ?? it.comments),
        // Instagram public posts do not expose share counts via this Actor.
        shares: 0,
      },
      page,
    });
  });

  // Newest-first by publication time. Pinned-but-old posts therefore sink when timestamps exist
  // (same approach as Facebook). Undated posts keep relative Actor order.
  posts.sort((a, b) => {
    if (a._ts !== null && b._ts !== null && a._ts !== b._ts) return b._ts - a._ts;
    return a._order - b._order;
  });

  const final = posts.slice(0, limit).map(({ _order, _ts, _pinned, ...rest }) => rest);
  return { page, posts: final };
}
