import { Activity } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { UnavailableNotice } from "@/components/shared/unavailable-notice";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Usage & Logs" };

export default function UsagePage() {
  return (
    <div>
      <PageHeader
        title="Usage & Logs"
        description="Local request activity, cache hits, provider attempts, and quota reservations."
      />
      <div className="mb-6 space-y-3">
        <UnavailableNotice title="No activity data available">
          Counters and audit events require Phase 7C persistence. Charts stay omitted until real series exist.
        </UnavailableNotice>
        <Alert variant="warning" title="Not Apify billing">
          Local attempt budgets are operational safeguards. Confirm financial usage in your own Apify account.
        </Alert>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Recent events</CardTitle>
          <CardDescription>Request, cache, provider, rate-limit, and quota signals</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={<Activity className="h-8 w-8" />}
            title="No logs yet"
            description="When wired, this list will show locally observed events without inventing spend figures."
          />
        </CardContent>
      </Card>
    </div>
  );
}
