import { PageHeader } from "@/components/layout/page-header";
import { Alert } from "@/components/ui/alert";
import { QuotaPanel } from "@/features/ops/cache-quota-panels";

export const metadata = { title: "Usage & Logs" };
export const dynamic = "force-dynamic";

export default function UsagePage() {
  return (
    <div>
      <PageHeader
        title="Usage & Logs"
        description="Local Apify attempt budget and operational signals. Not a substitute for Apify billing."
      />
      <div className="mb-6">
        <Alert variant="warning" title="Not Apify billing">
          Figures below are the local daily attempt counter. Confirm financial usage in your Apify account.
        </Alert>
      </div>
      <QuotaPanel />
    </div>
  );
}
