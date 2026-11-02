import { createHash } from 'node:crypto';

const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const pick = (...vals) => {
  for (const v of vals) {
    const s = str(v);
    if (s) return s;
  }
  return null;
};

function num(v) {
  if (Array.isArray(v)) return v.length;
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

function extractMedia(item) {
  const out = [];
  const seen = new Set();
  const add = (type, url, thumbnail = null) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({ type, url, thumbnail });
  };

  if (Array.isArray(item.__media)) item.__media.forEach((m) => add(m.type, m.url, m.thumbnail));

  const entries = Array.isArray(item.media) ? item.media : [];
  for (const m of entries) {
    if (typeof m === 'string') { add('image', m); continue; }
    if (!m || typeof m !== 'object') continue;
    const img = pick(
      m.photo_image?.uri, m.image?.uri, m.photo?.uri, m.thumbnail, m.thumbnailUrl,
      m.full_picture, m.src, m.uri, typeof m.image === 'string' ? m.image : null,
    );
    const vid = pick(m.video_url, m.videoUrl, m.playable_url, m.video?.playable_url, m.video?.url);
    const isVideo = vid || /video/i.test(`${m.__typename || ''} ${m.type || ''} ${m.media_type || ''}`);
    if (isVideo) add('video', vid || pick(m.url) || img, img);
    else add('image', img);
  }

  add('image', pick(item.image, item.imageUrl, item.full_picture, item.thumbnail, item.thumbnailUrl));
  if (Array.isArray(item.images)) item.images.forEach((u) => add('image', str(u)));
  const vidTop = pick(item.videoUrl, typeof item.video === 'string' ? item.video : null);
  if (vidTop) add('video', vidTop, pick(item.thumbnail, item.thumbnailUrl));
  return out;
}

const logoFallbackOf = (ref) => `https://graph.facebook.com/${encodeURIComponent(ref.id || ref.slug)}/picture?type=large`;

function pageIdCandidates(item) {
  const raw = [item.facebookId, item.pageId, item.page?.id];
  const out = [];
  for (const v of raw) {
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s) out.push(s);
  }
  return out;
}

function isPageAuthored(item) {
  const candidates = pageIdCandidates(item);
  if (!candidates.length) return true;
  const uid = item.user?.id;
  if (uid === undefined || uid === null) return false;
  return candidates.includes(String(uid));
}

/** Most frequent non-empty value; ties -> first seen. */
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

function collectPageIdentity(items, ref) {
  const authored = items.filter(isPageAuthored);

  const name =
    majorityVote(authored.map((it) => it.user?.name))
    || majorityVote(items.flatMap((it) => [it.pageName, it.page?.name, it.pageInfo?.name, it.profileName]))
    || majorityVote(items.flatMap((it) => [it.user?.name, it.author?.name]))
    || ref.slug || ref.id;

  const logo =
    majorityVote(authored.flatMap((it) => [it.user?.profilePic, it.user?.profilePicture]))
    || majorityVote(items.flatMap((it) => [
      it.pageLogo, it.pageProfilePic, it.pageProfilePicture,
      it.page?.profilePic, it.page?.profilePicture, it.page?.logo,
      it.profilePic, it.profilePicture,
      it.author?.profilePic, it.author?.profilePicture,
      it.user?.profilePic, it.user?.profilePicture,
    ]))
    || logoFallbackOf(ref);

  const id =
    majorityVote(authored.flatMap((it) => pageIdCandidates(it)))
    || majorityVote(items.flatMap((it) => pageIdCandidates(it)))
    || (ref.id || null);

  return {
    id: id || null,
    name,
    logo,
    logo_fallback: logoFallbackOf(ref),
    url: ref.url,
  };
}

/**
 * Converts the raw items of any provider into the stable response shape.
 * Every post carries the same `page` object ({ id, name, logo, logo_fallback, url }).
 */
export function normalizeItems(rawItems, ref, limit = 10) {
  const items = (Array.isArray(rawItems) ? rawItems : []).filter(
    (x) => x && typeof x === 'object' && !x.error && !x.errorDescription,
  );

  const page = collectPageIdentity(items, ref);

  const seen = new Set();
  const posts = [];
  items.forEach((it, index) => {
    const url = pick(it.url, it.postUrl, it.topLevelUrl, it.permalink_url, it.link);
    const rawId = it.postId ?? it.post_id ?? it.id;
    const id = rawId !== undefined && rawId !== null && String(rawId) ? String(rawId)
      : (url ? createHash('sha1').update(url).digest('hex').slice(0, 16) : null);
    if (!id || seen.has(id)) return;

    const text = pick(it.text, it.message, it.caption, it.content) || '';
    const media = extractMedia(it);
    if (!text && !media.length && !url) return;

    seen.add(id);
    const createdAt = toIso(it.time ?? it.timestamp ?? it.created_time ?? it.date ?? it.publishedAt);
    posts.push({
      _order: index,
      _ts: createdAt ? Date.parse(createdAt) : null,
      id,
      url: url || null,
      text,
      created_at: createdAt,
      image: media.find((m) => m.type === 'image')?.url || media.find((m) => m.thumbnail)?.thumbnail || null,
      media,
      stats: {
        likes: num(it.likes ?? it.reactionsCount ?? it.reactions_count ?? it.topReactionsCount),
        comments: num(it.comments ?? it.commentsCount ?? it.comments_count),
        shares: num(it.shares ?? it.sharesCount ?? it.shares_count),
      },
      page,
    });
  });

  // Newest first (pinned/old posts that Facebook lists first are pushed down); undated posts keep their order.
  posts.sort((a, b) => {
    if (a._ts !== null && b._ts !== null && a._ts !== b._ts) return b._ts - a._ts;
    return a._order - b._order;
  });

  const final = posts.slice(0, limit).map(({ _order, _ts, ...rest }) => rest);
  return { page, posts: final };
}
