import { ProviderError, isRetryableStatus } from '../errors.js';
import { normalizeItems } from '../normalize.js';
import { isInstagramRef } from '../instagramRef.js';

const POST_FIELDS = [
  'id', 'message', 'created_time', 'permalink_url', 'full_picture',
  'attachments{media_type,media,url,subattachments}',
  'shares', 'reactions.summary(true).limit(0)', 'comments.summary(true).limit(0)',
].join(',');

function mediaOf(post) {
  const out = [];
  const walk = (att) => {
    if (!att) return;
    const src = att.media?.image?.src;
    if (src) out.push({ type: /video/i.test(att.media_type || '') ? 'video' : 'image', url: att.media_type === 'video' ? (att.url || src) : src, thumbnail: src });
    (att.subattachments?.data || []).forEach(walk);
  };
  (post.attachments?.data || []).forEach(walk);
  return out;
}

export function createGraphProvider(config) {
  const cfg = config.graph;
  const tokenFor = (ref) => cfg.tokens[ref.key] || (ref.slug && cfg.tokens[ref.slug.toLowerCase()]) || (ref.id && cfg.tokens[ref.id]) || null;

  async function call(path, params, token) {
    const qs = new URLSearchParams({ ...params, access_token: token });
    let res;
    try {
      res = await fetch(`${cfg.baseUrl}/${cfg.version}/${path}?${qs}`, { signal: AbortSignal.timeout(cfg.timeoutMs) });
    } catch (err) {
      throw new ProviderError(`graph network/timeout error: ${err.name}`, { retryable: true });
    }
    let body = null;
    try { body = await res.json(); } catch { /* handled below */ }
    if (!res.ok || !body || body.error) {
      const e = body?.error;
      const msg = e ? `${e.type || 'Error'} ${e.code || ''}: ${String(e.message || '').slice(0, 150)}` : `HTTP ${res.status}`;
      // 4xx (bad/expired token, missing permission) will not fix itself => do not retry.
      throw new ProviderError(`graph ${msg}`, { retryable: isRetryableStatus(res.status), status: res.status });
    }
    return body;
  }

  return {
    name: 'graph',
    supports: (ref) => !isInstagramRef(ref) && Boolean(tokenFor(ref)),

    async fetch(ref, limit) {
      const token = tokenFor(ref);
      const id = ref.id || ref.slug;
      const [pageRes, postsRes] = await Promise.all([
        call(encodeURIComponent(id), { fields: 'id,name,link,picture.type(large)' }, token),
        call(`${encodeURIComponent(id)}/posts`, { fields: POST_FIELDS, limit: String(limit) }, token),
      ]);

      const raw = (postsRes.data || []).map((p) => ({
        postId: p.id,
        url: p.permalink_url,
        text: p.message,
        time: p.created_time,
        likes: p.reactions?.summary?.total_count,
        comments: p.comments?.summary?.total_count,
        shares: p.shares?.count,
        image: p.full_picture,
        __media: mediaOf(p),
        pageId: pageRes.id,
        pageName: pageRes.name,
        pageLogo: pageRes.picture?.data?.url,
      }));
      return normalizeItems(raw, ref, limit);
    },
  };
}
