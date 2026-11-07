import { PageHeader } from "@/components/layout/page-header";
import { CacheManager } from "@/features/ops/cache-manager";
import { fetchCacheSummary } from "@/lib/auth/management";
import { requireAdmin } from "@/lib/auth/session";

export const metadata = { title: "Cache" };
export const dynamic = "force-dynamic";

type CacheEntry = {
  id: string;
  platform: string;
  username: string;
  postCount: number;
  fetchedAt: string | null;
  ageSeconds: number | null;
  freshness: string;
};

export default async function CachePage() {
  await requireAdmin();
  const result = await fetchCacheSummary();
  const data = (result.ok ? result.body.data : null) as { entries?: CacheEntry[] } | null;
  const entries = Array.isArray(data?.entries) ? data.entries : [];

  return (
    <div>
      <PageHeader
        title="Cache"
        description="Inspect and delete individual Facebook or Instagram cache entries. Deletion never resets quota."
      />
      <CacheManager initialEntries={entries} />
    </div>
  );
}
