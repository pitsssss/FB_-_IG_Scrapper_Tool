# Next.js App Router integration (server-side)

Copy these files into a Next.js App Router project.

## Environment (server only)

```bash
FB_POSTS_API_BASE_URL=https://api.example.com
FB_POSTS_API_KEY=your_site_secret_here
FB_POSTS_PAGE_URL=https://www.facebook.com/cern
```

Never use `NEXT_PUBLIC_` for `FB_POSTS_API_KEY`.

## Files

| Path in your Next app | Purpose |
| --- | --- |
| `app/api/facebook-posts/route.ts` | Server route that calls fb-posts-api |
| `lib/fb-posts.ts` | Typed fetch helper + timeout |
| `components/FacebookPosts.tsx` | Server component renderer |

Browser → `/api/facebook-posts` (your app) → fb-posts-api (secret stays on server).
