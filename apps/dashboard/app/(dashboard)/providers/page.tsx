import { PageHeader } from "@/components/layout/page-header";
import { UnavailableNotice } from "@/components/shared/unavailable-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusIndicator } from "@/components/ui/status-indicator";

export const metadata = { title: "Connected Providers" };

export default function ProvidersPage() {
  return (
    <div>
      <PageHeader
        title="Connected Providers"
        description="Bring your own Apify account. Token collection and encrypted storage are Phase 7C — not available here."
      />
      <div className="mb-6">
        <UnavailableNotice title="Token input disabled">
          Do not paste Apify tokens into this foundation UI. Secure validation and persistence are not implemented yet.
        </UnavailableNotice>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle>Apify</CardTitle>
              <CardDescription>
                Facebook posts scraper, Instagram post scraper, optional profile enrichment Actor. Shared local attempt budget.
              </CardDescription>
            </div>
            <Badge variant="outline">Required for live scrapes</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <StatusIndicator tone="idle" label="Not connected" detail="Awaiting secure onboarding" />
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled>
                Connect
              </Button>
              <Button type="button" variant="outline" disabled>
                Replace
              </Button>
              <Button type="button" variant="outline" disabled>
                Disconnect
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Meta Graph API</CardTitle>
            <CardDescription>Optional for Facebook Pages you manage via GRAPH_PAGE_TOKENS.</CardDescription>
          </CardHeader>
          <CardContent>
            <StatusIndicator tone="unknown" label="Env-configured only" detail="Dashboard Graph management deferred" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Instagram profile enrichment</CardTitle>
            <CardDescription>Optional Actor, disabled by default, shares Apify quota.</CardDescription>
          </CardHeader>
          <CardContent>
            <StatusIndicator tone="idle" label="Off by default" detail="Toggle lands with settings APIs" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
