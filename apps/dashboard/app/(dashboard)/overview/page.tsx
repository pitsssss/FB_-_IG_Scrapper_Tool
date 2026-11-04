import { PageHeader } from "@/components/layout/page-header";
import { UnavailableNotice } from "@/components/shared/unavailable-notice";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { Badge } from "@/components/ui/badge";
import { fetchHealth } from "@/lib/api/client";

export const metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const health = await fetchHealth();

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Deployment readiness cards. Management metrics arrive with Phase 7C APIs — nothing here invents operational data."
      />

      <div className="mb-6">
        <UnavailableNotice title="Management data not configured">
          Quota, cache summaries, and activity feeds require authenticated admin endpoints. Optional API{" "}
          <code className="font-mono text-xs">/health</code> probing below is not an admin session.
        </UnavailableNotice>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>API health</CardTitle>
            <CardDescription>GET /health via API_INTERNAL_URL</CardDescription>
          </CardHeader>
          <CardContent>
            {health.ok ? (
              <StatusIndicator tone="ok" label="Reachable" detail='Upstream returned status "ok"' />
            ) : (
              <StatusIndicator tone="warn" label="Unavailable" detail={health.reason} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Apify connection</CardTitle>
            <CardDescription>Operator-owned token</CardDescription>
          </CardHeader>
          <CardContent>
            <StatusIndicator tone="idle" label="Not configured" detail="Token onboarding ships in Phase 7C" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Supported platforms</CardTitle>
            <CardDescription>Public posts API</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Badge>Facebook</Badge>
            <Badge>Instagram</Badge>
            <p className="w-full text-xs text-[var(--muted-foreground)]">
              Capability is implemented in the Node API. Connection status is separate from support.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Local quota usage</CardTitle>
            <CardDescription>Attempt budget — not Apify billing</CardDescription>
          </CardHeader>
          <CardContent>
            <StatusIndicator tone="unknown" label="No activity data available" detail="Awaiting management API" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cache summary</CardTitle>
            <CardDescription>Persistent CACHE_DIR</CardDescription>
          </CardHeader>
          <CardContent>
            <StatusIndicator tone="unknown" label="No activity data available" detail="Awaiting management API" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity & errors</CardTitle>
            <CardDescription>Local audit stream</CardDescription>
          </CardHeader>
          <CardContent>
            <StatusIndicator tone="unknown" label="No activity data available" detail="Awaiting management API" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
