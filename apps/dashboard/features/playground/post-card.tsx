"use client";

import { useState } from "react";
import type { Post, PageIdentity } from "@/types/api";
import { safeHttpUrl } from "@/lib/utils/safe-url";
import { Badge } from "@/components/ui/badge";

function SafeImg({
  src,
  alt,
  fallback,
  className,
}: {
  src: string | null | undefined;
  alt: string;
  fallback?: string | null;
  className?: string;
}) {
  const primary = safeHttpUrl(src);
  const fb = safeHttpUrl(fallback);
  const [failed, setFailed] = useState(false);
  const [useFb, setUseFb] = useState(false);
  const current = !failed ? (useFb ? fb : primary) : fb && useFb ? null : fb;
  if (!current) {
    return (
      <div
        className={`flex items-center justify-center bg-[var(--muted)] text-xs text-[var(--muted-foreground)] ${className || ""}`}
        aria-hidden
      >
        No image
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- scraped remote media; avoid privileged proxy
    <img
      src={current}
      alt={alt}
      className={className}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => {
        if (!useFb && fb && fb !== primary) setUseFb(true);
        else setFailed(true);
      }}
    />
  );
}

export function AccountHeader({ page }: { page: PageIdentity }) {
  const profileUrl = safeHttpUrl(page.url);
  return (
    <div className="flex items-center gap-3">
      <SafeImg
        src={page.logo}
        fallback={page.logo_fallback}
        alt=""
        className="h-12 w-12 rounded-full object-cover"
      />
      <div className="min-w-0">
        <p className="truncate font-medium text-[var(--foreground)]">{page.name || "Unknown"}</p>
        {profileUrl ? (
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-xs text-[var(--muted-foreground)] underline-offset-2 hover:underline"
          >
            Open profile
          </a>
        ) : (
          <p className="text-xs text-[var(--muted-foreground)]">No profile URL</p>
        )}
      </div>
    </div>
  );
}

export function PostCard({ post }: { post: Post }) {
  const permalink = safeHttpUrl(post.url);
  const primary = post.image || post.media?.[0]?.url || null;
  const thumb = post.media?.find((m) => m.type === "video")?.thumbnail || null;

  return (
    <article className="space-y-3 border-b border-[var(--border)] pb-4 last:border-0">
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted-foreground)]">
        {post.created_at ? <time dateTime={post.created_at}>{new Date(post.created_at).toLocaleString()}</time> : null}
        {permalink ? (
          <a href={permalink} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
            Permalink
          </a>
        ) : null}
      </div>
      {post.text ? (
        <p className="whitespace-pre-wrap break-words text-sm text-[var(--foreground)]">{post.text}</p>
      ) : (
        <p className="text-sm italic text-[var(--muted-foreground)]">No text</p>
      )}
      <SafeImg
        src={primary}
        fallback={thumb}
        alt=""
        className="max-h-80 w-full rounded-md object-cover"
      />
      {post.media?.length ? (
        <div className="flex flex-wrap gap-1">
          {post.media.map((m, i) => (
            <Badge key={`${m.type}-${i}`} variant="outline">
              {m.type || "media"}
            </Badge>
          ))}
        </div>
      ) : null}
      <dl className="grid grid-cols-3 gap-2 text-xs text-[var(--muted-foreground)]">
        <div>
          <dt className="font-medium text-[var(--foreground)]">Likes</dt>
          <dd>{post.stats?.likes ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-medium text-[var(--foreground)]">Comments</dt>
          <dd>{post.stats?.comments ?? "—"}</dd>
        </div>
        <div>
          <dt className="font-medium text-[var(--foreground)]">Shares</dt>
          <dd>{post.stats?.shares ?? "—"}</dd>
        </div>
      </dl>
    </article>
  );
}
