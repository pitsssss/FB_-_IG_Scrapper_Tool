/** DTOs aligned with docs/API_CONTRACT.md — for future playground rendering (7D). */

export type PageIdentity = {
  id: string | null;
  name: string;
  logo: string;
  logo_fallback: string;
  url: string;
};

export type MediaItem = {
  type: string;
  url: string;
  thumbnail: string | null;
};

export type PostStats = {
  likes: number;
  comments: number;
  shares: number;
};

export type Post = {
  id: string;
  url: string;
  text: string;
  created_at: string | null;
  image: string | null;
  media: MediaItem[];
  stats: PostStats;
  page: PageIdentity;
};

export type PostsMeta = {
  source: "live" | "cache" | "stale-cache";
  provider: string;
  fetched_at: string;
  cache_age_seconds: number;
  stale: boolean;
  count: number;
  limit: number;
  warning: string | null;
};

export type PostsSuccessResponse = {
  success: true;
  data: {
    page: PageIdentity;
    posts: Post[];
  };
  meta: PostsMeta;
};

export type ApiErrorResponse = {
  success: false;
  error: {
    code: string;
    message: string;
  };
};

export type PostsResponse = PostsSuccessResponse | ApiErrorResponse;
