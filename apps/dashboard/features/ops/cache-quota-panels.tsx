"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type CacheEntry = {
  id: string;
  platform: string;
  username: string;
  postCount: number;
  fetchedAt: string | null;
  ageSeconds: number | null;
  freshness: string;
  source: string | null;
};

type Quota = {
  available: boolean;
  dailyLimit: number | null;
  consumed: number | null;
  remaining: number | null;
  todayUtc: string | null;
  paidExecutionAllowed: boolean;
  maxChargeUsdPerRun: number | null;
  note: string;
};

export function CachePanel() {
  const [entries, setEntries] = useState<CacheEntry[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/management/ops?kind=cache")
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error?.message || "Failed to load cache");
        setEntries(body.data?.entries || []);
        setTruncated(Boolean(body.data?.truncated));
      })
      .catch((err) => setError(err.message));
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cache entries</CardTitle>
        <CardDescription>Read-only metadata. Purge and force-refresh arrive in a later phase.</CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <Alert variant="danger" title="Cache">
            {error}
          </Alert>
        ) : entries.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">No cache entries found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="text-xs text-[var(--muted-foreground)]">
                <tr>
                  <th className="py-2 pr-3 font-medium">Platform</th>
                  <th className="py-2 pr-3 font-medium">Username</th>
                  <th className="py-2 pr-3 font-medium">Posts</th>
                  <th className="py-2 pr-3 font-medium">Freshness</th>
                  <th className="py-2 font-medium">Fetched</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-t border-[var(--border)]">
                    <td className="py-2 pr-3">{e.platform}</td>
                    <td className="py-2 pr-3 font-mono text-sm [overflow-wrap:anywhere]">{e.username}</td>
                    <td className="py-2 pr-3">{e.postCount}</td>
                    <td className="py-2 pr-3">
                      <Badge variant="outline">{e.freshness}</Badge>
                    </td>
                    <td className="py-2 text-xs text-[var(--muted-foreground)]">{e.fetchedAt || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {truncated ? (
              <p className="mt-2 text-xs text-[var(--muted-foreground)]">List truncated.</p>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function QuotaPanel() {
  const [quota, setQuota] = useState<Quota | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/management/ops?kind=quota")
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error?.message || "Failed to load quota");
        setQuota(body.data as Quota);
      })
      .catch((err) => setError(err.message));
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Local Apify attempt budget</CardTitle>
        <CardDescription>Not Apify account spend or remaining dollars.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <Alert variant="danger" title="Quota">
            {error}
          </Alert>
        ) : !quota ? (
          <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>
        ) : (
          <>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[var(--muted-foreground)]">Daily limit</dt>
                <dd className="font-medium">{quota.dailyLimit ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted-foreground)]">Consumed (UTC day)</dt>
                <dd className="font-medium">{quota.consumed ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted-foreground)]">Remaining</dt>
                <dd className="font-medium">{quota.remaining ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted-foreground)]">Paid execution allowed</dt>
                <dd className="font-medium">{quota.paidExecutionAllowed ? "Yes" : "No"}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted-foreground)]">UTC date</dt>
                <dd className="font-medium">{quota.todayUtc || "—"}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted-foreground)]">Max charge / run</dt>
                <dd className="font-medium">{quota.maxChargeUsdPerRun ?? "—"}</dd>
              </div>
            </dl>
            <Alert variant="info" title="Interpretation">
              {quota.note}
            </Alert>
          </>
        )}
      </CardContent>
    </Card>
  );
}
