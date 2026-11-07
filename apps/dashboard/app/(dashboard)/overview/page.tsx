import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { Badge } from "@/components/ui/badge";
import { fetchHealth } from "@/lib/api/client";
import { fetchCacheSummary, fetchProviderStatus, fetchQuotaStatus } from "@/lib/auth/management";
import { requireAdmin } from "@/lib/auth/session";

export const metadata = { title: "Overview" };
export const dynamic = "force-dynamic";

type ProviderData = {
  connected?: boolean;
  source?: string;
};

type CacheData = {
  entries?: unknown[];
  truncated?: boolean;
};

type QuotaData = {
  available?: boolean;
  paidExecutionAllowed?: boolean;
  consumed?: number | null;
  dailyLimit?: number | null;
  remaining?: number | null;
  todayUtc?: string | null;
  note?: string;
};

export default async function OverviewPage() {
  await requireAdmin();
  const [health, provider, cache, quota] = await Promise.all([
    fetchHealth(),
    fetchProviderStatus(),
    fetchCacheSummary(),
    fetchQuotaStatus(),
  ]);

  const providerData = (provider.ok ? provider.body.data : null) as ProviderData | null;
  const cacheData = (cache.ok ? cache.body.data : null) as CacheData | null;
  const quotaData = (quota.ok ? quota.body.data : null) as QuotaData | null;
  const entryCount = Array.isArray(cacheData?.entries) ? cacheData.entries.length : null;

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Live management metadata from authenticated admin APIs. Missing values stay unavailable — nothing is invented."
      />

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
            <CardDescription>Managed credential status</CardDescription>
          </CardHeader>
          <CardContent>
            {providerData ? (
              <StatusIndicator
                tone={providerData.connected ? "ok" : "warn"}
                label={providerData.connected ? "Connected" : "Not connected"}
                detail={`Source: ${providerData.source || "none"}`}
              />
            ) : (
              <StatusIndicator tone="unknown" label="Unavailable" detail="Could not load provider status" />
            )}
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Local quota usage</CardTitle>
            <CardDescription>Attempt budget — not Apify billing</CardDescription>
          </CardHeader>
          <CardContent>
            {quotaData?.available ? (
              <StatusIndicator
                tone={quotaData.paidExecutionAllowed ? "ok" : "warn"}
                label={`${quotaData.consumed ?? "—"} / ${quotaData.dailyLimit ?? "—"} used`}
                detail={`Remaining ${quotaData.remaining ?? "—"} · UTC ${quotaData.todayUtc || ""}`}
              />
            ) : (
              <StatusIndicator
                tone="unknown"
                label="Unavailable"
                detail={quotaData?.note || "Quota status could not be loaded"}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cache summary</CardTitle>
            <CardDescription>Persistent CACHE_DIR entries (metadata only)</CardDescription>
          </CardHeader>
          <CardContent>
            {entryCount != null ? (
              <StatusIndicator
                tone="ok"
                label={`${entryCount} entr${entryCount === 1 ? "y" : "ies"}`}
                detail={cacheData?.truncated ? "List truncated" : "Listed from local cache"}
              />
            ) : (
              <StatusIndicator tone="unknown" label="Unavailable" detail="Could not load cache summary" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
