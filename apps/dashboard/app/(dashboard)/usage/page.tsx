import { PageHeader } from "@/components/layout/page-header";
import { UsagePanel } from "@/features/ops/usage-panel";
import { requireAdmin } from "@/lib/auth/session";

export const metadata = { title: "Usage & Logs" };
export const dynamic = "force-dynamic";

export default async function UsagePage() {
  await requireAdmin();
  return (
    <div>
      <PageHeader
        title="Usage & Logs"
        description="Local request and provider telemetry with the shared Apify attempt budget. Not a billing dashboard."
      />
      <UsagePanel />
    </div>
  );
}
