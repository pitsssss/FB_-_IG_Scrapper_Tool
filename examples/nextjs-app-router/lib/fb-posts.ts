export type FbPage = {
  id: string | null;
  name: string;
  logo: string;
  logo_fallback: string;
  url: string;
};

export type FbMedia = { type: 'image' | 'video'; url: string; thumbnail: string | null };

export type FbPost = {
  id: string;
  url: string | null;
  text: string;
  created_at: string | null;
  image: string | null;
  media: FbMedia[];
  stats: { likes: number; comments: number; shares: number };
  page: FbPage;
};

export type FbSuccess = {
  success: true;
  data: { page: FbPage; posts: FbPost[] };
  meta: {
    source: 'live' | 'cache' | 'stale-cache';
    provider: string;
    fetched_at: string;
    cache_age_seconds: number;
    stale: boolean;
    count: number;
    limit: number;
    warning: string | null;
  };
};

export type FbError = {
  success: false;
  error: { code: string; message: string };
};

export type FbResult = FbSuccess | FbError;

export async function fetchFacebookPosts(options?: {
  pageUrl?: string;
  limit?: number;
  timeoutMs?: number;
}): Promise<{ ok: true; data: FbSuccess } | { ok: false; status: number; data: FbError | null; reason: string }> {
  const base = process.env.FB_POSTS_API_BASE_URL;
  const key = process.env.FB_POSTS_API_KEY;
  const page = options?.pageUrl || process.env.FB_POSTS_PAGE_URL;
  if (!base || !key || !page) {
    return { ok: false, status: 500, data: null, reason: 'Server misconfigured' };
  }

  const limit = options?.limit ?? 10;
  const timeoutMs = options?.timeoutMs ?? 20_000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const url = `${base.replace(/\/+$/, '')}/api/v1/facebook/posts?page=${encodeURIComponent(page)}&limit=${limit}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'x-api-key': key },
      signal: ctrl.signal,
      // Keep this private to the server runtime; tune as needed.
      next: { revalidate: 60 },
    });
    const json = (await res.json()) as FbResult;
    if (!res.ok || !json || json.success !== true) {
      const err = json && 'success' in json && json.success === false ? json : null;
      return { ok: false, status: res.status, data: err, reason: err?.error?.message || `HTTP ${res.status}` };
    }
    return { ok: true, data: json };
  } catch (err) {
    const reason = err instanceof Error ? err.name : 'network_error';
    return { ok: false, status: 0, data: null, reason };
  } finally {
    clearTimeout(timer);
  }
}
