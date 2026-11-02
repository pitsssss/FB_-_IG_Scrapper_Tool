import { fetchFacebookPosts } from '../lib/fb-posts';

function safeHref(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Server Component — calls fb-posts-api only through server-side helpers. */
export default async function FacebookPosts() {
  const result = await fetchFacebookPosts();

  if (!result.ok) {
    return (
      <section aria-live="polite">
        <p>Facebook updates are temporarily unavailable.</p>
      </section>
    );
  }

  const { page, posts } = result.data.data;
  const stale = result.data.meta.stale;

  return (
    <section>
      <header style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        {/* Prefer live logo; keep logo_fallback available for client-side onerror if you wrap this in a client img. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={page.logo || page.logo_fallback} alt="" width={48} height={48} />
        <div>
          <h2>{page.name}</h2>
          {stale ? <p>Showing recently cached posts.</p> : null}
        </div>
      </header>

      <ul>
        {posts.map((post) => {
          const href = safeHref(post.url);
          return (
            <li key={post.id}>
              {post.created_at ? <time dateTime={post.created_at}>{post.created_at}</time> : null}
              {post.text ? <p>{post.text}</p> : null}
              {post.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.image} alt="" loading="lazy" />
              ) : null}
              {!post.text && !post.image && post.media?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={post.media[0].thumbnail || post.media[0].url} alt="" loading="lazy" />
              ) : null}
              {href ? (
                <p>
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    View on Facebook
                  </a>
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
