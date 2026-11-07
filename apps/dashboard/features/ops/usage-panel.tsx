"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Period = "today" | "7d" | "30d";

type Summary = {
  period: string;
  since: string;
  until: string;
  counts: Record<string, number>;
  note?: string;
  collectionStartedNote?: string;
  quota?: {
    dailyLimit: number | null;
    consumed: number | null;
    remaining: number | null;
    todayUtc: string | null;
    paidExecutionAllowed: boolean;
    note?: string;
  };
};

type EventRow = {
  id: number;
  at: string;
  category: string;
  outcome: string;
  platform: string | null;
  clientName: string | null;
  httpStatus: number | null;
  durationMs: number | null;
  source: string | null;
};

const METRIC_LABELS: { key: string; label: string }[] = [
  { key: "publicRequests", label: "Public API requests" },
  { key: "facebookRequests", label: "Facebook requests" },
  { key: "instagramRequests", label: "Instagram requests" },
  { key: "cacheHits", label: "Cache hits" },
  { key: "staleCache", label: "Stale-cache deliveries" },
  { key: "liveResponses", label: "Live responses" },
  { key: "providerAttempts", label: "Provider attempts" },
  { key: "providerFailures", label: "Provider failures" },
  { key: "rateLimited", label: "Rate limited" },
  { key: "playgroundCache", label: "Playground cache reads" },
  { key: "playgroundConfirm", label: "Playground confirms" },
  { key: "cacheDeletes", label: "Cache deletes" },
];

export function UsagePanel() {
  const [period, setPeriod] = useState<Period>("today");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setError(null);
      try {
        const [sRes, eRes] = await Promise.all([
          fetch(`/api/management/usage?kind=summary&period=${period}`),
          fetch(`/api/management/usage?kind=events&period=${period}&limit=40`),
        ]);
        const sBody = await sRes.json().catch(() => ({}));
        const eBody = await eRes.json().catch(() => ({}));
        if (!sRes.ok) throw new Error(sBody?.error?.message || "Failed to load usage summary");
        if (!eRes.ok) throw new Error(eBody?.error?.message || "Failed to load events");
        if (!cancelled) {
          setSummary(sBody.data as Summary);
          setEvents(eBody.data?.events || []);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Load failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [period]);

  const counts = summary?.counts || {};
  const hasAny = Object.values(counts).some((n) => Number(n) > 0);

  return (
    <div className="space-y-6">
      <Alert variant="warning" title="Not Apify billing">
        These are local operational counters. Cache hits are not provider attempts. Confirm financial usage in your Apify
        account.
      </Alert>
      {error ? (
        <Alert variant="danger" title="Usage">
          {error}
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {(["today", "7d", "30d"] as Period[]).map((p) => (
          <Button key={p} variant={period === p ? "default" : "secondary"} onClick={() => setPeriod(p)}>
            {p === "today" ? "Today (UTC)" : p === "7d" ? "Last 7 days" : "Last 30 days"}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Local quota</CardTitle>
          <CardDescription>{summary?.quota?.note || "Attempt budget for this UTC day."}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-4">
          <div>
            <div className="text-[var(--muted-foreground)]">Daily limit</div>
            <div className="font-mono">{summary?.quota?.dailyLimit ?? "—"}</div>
          </div>
          <div>
            <div className="text-[var(--muted-foreground)]">Consumed</div>
            <div className="font-mono">{summary?.quota?.consumed ?? "—"}</div>
          </div>
          <div>
            <div className="text-[var(--muted-foreground)]">Remaining</div>
            <div className="font-mono">{summary?.quota?.remaining ?? "—"}</div>
          </div>
          <div>
            <div className="text-[var(--muted-foreground)]">UTC day</div>
            <div className="font-mono">{summary?.quota?.todayUtc ?? "—"}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Request metrics</CardTitle>
          <CardDescription>
            {summary?.collectionStartedNote || "Only events recorded after telemetry was enabled."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!hasAny ? (
            <p className="text-sm text-[var(--muted-foreground)]">No telemetry in this period yet.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {METRIC_LABELS.map(({ key, label }) => (
                <div key={key} className="rounded-md border border-[var(--border)] p-3">
                  <div className="text-xs text-[var(--muted-foreground)]">{label}</div>
                  <div className="mt-1 font-mono text-lg">{counts[key] ?? 0}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent events</CardTitle>
          <CardDescription>Sanitized operational events (no secrets or post text).</CardDescription>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">No events yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="text-xs text-[var(--muted-foreground)]">
                  <tr>
                    <th className="py-2 pr-3 font-medium">When</th>
                    <th className="py-2 pr-3 font-medium">Category</th>
                    <th className="py-2 pr-3 font-medium">Platform</th>
                    <th className="py-2 pr-3 font-medium">Outcome</th>
                    <th className="py-2 pr-3 font-medium">Source</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id} className="border-t border-[var(--border)]">
                      <td className="py-2 pr-3 text-xs">{new Date(e.at).toLocaleString()}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{e.category}</td>
                      <td className="py-2 pr-3">{e.platform || "—"}</td>
                      <td className="py-2 pr-3">
                        <Badge variant="outline">{e.outcome}</Badge>
                      </td>
                      <td className="py-2 pr-3 text-xs">{e.source || "—"}</td>
                      <td className="py-2 text-xs">{e.httpStatus ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
