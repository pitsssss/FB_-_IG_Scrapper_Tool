import { PageHeader } from "@/components/layout/page-header";
import { CachePanel } from "@/features/ops/cache-quota-panels";

export const metadata = { title: "Cache" };
export const dynamic = "force-dynamic";

export default function CachePage() {
  return (
    <div>
      <PageHeader
        title="Cache"
        description="Inspect cached Facebook and Instagram entries. Purge and force-refresh are deferred to a later phase."
      />
      <CachePanel />
    </div>
  );
}
