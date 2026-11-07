import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { ApifyPanel } from "@/features/providers/apify-panel";

export const metadata = { title: "Connected Providers" };
export const dynamic = "force-dynamic";

export default function ProvidersPage() {
  return (
    <div>
      <PageHeader
        title="Connected Providers"
        description="Connect your Apify account. Tokens are encrypted at rest and never shown again after save."
      />
      <div className="space-y-4">
        <ApifyPanel />

        <Card>
          <CardHeader>
            <CardTitle>Meta Graph API</CardTitle>
            <CardDescription>Optional for Facebook Pages you manage via GRAPH_PAGE_TOKENS.</CardDescription>
          </CardHeader>
          <CardContent>
            <StatusIndicator tone="unknown" label="Env-configured only" detail="Dashboard Graph management is not in this phase" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Instagram profile enrichment</CardTitle>
            <CardDescription>Optional Actor, disabled by default, shares Apify quota.</CardDescription>
          </CardHeader>
          <CardContent>
            <StatusIndicator tone="idle" label="Configured via environment" detail="Toggle remains a settings concern for a later phase" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
