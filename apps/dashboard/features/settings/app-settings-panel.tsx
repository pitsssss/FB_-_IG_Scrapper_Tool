"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getCsrfToken } from "@/lib/auth/client-csrf";

type SettingRow = {
  key: string;
  type: string;
  apply: string;
  description: string;
  status: string;
  envDefault: unknown;
  managedValue: unknown;
  effective: unknown;
  mode?: string | null;
  constraints?: { min?: number; max?: number; maxItems?: number } | null;
};

export type SettingsSnapshot = {
  settings: Record<string, SettingRow>;
  readOnly?: {
    apifyMaxChargeUsdPerRun: number | null;
    apifyDailyCeiling: number;
    note: string;
  };
  applied?: string[];
  pendingRestart?: string[];
};

function listToText(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => String(x).replace(/^instagram:/, "")).join("\n");
  return "";
}

function textToList(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function fieldsFromSnapshot(snap: SettingsSnapshot | null | undefined) {
  const s = snap?.settings || {};
  return {
    fbAllow: listToText(s.allowed_facebook?.effective),
    igAllow: listToText(s.allowed_instagram?.effective),
    ttl: String(s.fresh_ttl_seconds?.effective ?? 21600),
    dailyLimit: String(s.apify_daily_run_limit?.effective ?? 12),
    enrichment: Boolean(s.instagram_profile_enrichment?.effective),
    warmEnabled: Boolean(s.warm_enabled?.effective),
    warmFb: listToText(s.warm_facebook?.effective),
    warmIg: listToText(s.warm_instagram?.effective),
    warmInterval: String(s.warm_interval_seconds?.effective ?? 3600),
    warmConcurrency: String(s.warm_concurrency?.effective ?? 1),
  };
}

export function AppSettingsPanel({ initial }: { initial?: SettingsSnapshot | null }) {
  const seed = fieldsFromSnapshot(initial);
  const [data, setData] = useState<SettingsSnapshot | null>(initial || null);
  const [error, setError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fbAllow, setFbAllow] = useState(seed.fbAllow);
  const [igAllow, setIgAllow] = useState(seed.igAllow);
  const [ttl, setTtl] = useState(seed.ttl);
  const [dailyLimit, setDailyLimit] = useState(seed.dailyLimit);
  const [enrichment, setEnrichment] = useState(seed.enrichment);
  const [warmEnabled, setWarmEnabled] = useState(seed.warmEnabled);
  const [warmFb, setWarmFb] = useState(seed.warmFb);
  const [warmIg, setWarmIg] = useState(seed.warmIg);
  const [warmInterval, setWarmInterval] = useState(seed.warmInterval);
  const [warmConcurrency, setWarmConcurrency] = useState(seed.warmConcurrency);
  const [confirmWarm, setConfirmWarm] = useState(false);

  const hydrate = useCallback((snap: SettingsSnapshot) => {
    setData(snap);
    const next = fieldsFromSnapshot(snap);
    setFbAllow(next.fbAllow);
    setIgAllow(next.igAllow);
    setTtl(next.ttl);
    setDailyLimit(next.dailyLimit);
    setEnrichment(next.enrichment);
    setWarmEnabled(next.warmEnabled);
    setWarmFb(next.warmFb);
    setWarmIg(next.warmIg);
    setWarmInterval(next.warmInterval);
    setWarmConcurrency(next.warmConcurrency);
  }, []);

  useEffect(() => {
    if (initial) return;
    let cancelled = false;
    fetch("/api/management/settings")
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error?.message || "Failed to load settings");
        if (!cancelled) hydrate(body.data as SettingsSnapshot);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [initial, hydrate]);

  async function save(partial: Record<string, unknown>, opts?: { confirmWarmEnable?: boolean }) {
    setSaving(true);
    setError(null);
    setBanner(null);
    try {
      const res = await fetch("/api/management/settings", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": getCsrfToken() || "",
        },
        body: JSON.stringify({
          settings: partial,
          confirmWarmEnable: opts?.confirmWarmEnable || false,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error?.message || "Save failed");
      hydrate(body.data as SettingsSnapshot);
      const pending = body.data?.pendingRestart || [];
      const applied = body.data?.applied || [];
      setBanner(
        pending.length
          ? `Saved. Applied: ${applied.join(", ") || "none"}. Restart required for: ${pending.join(", ")}.`
          : `Saved and applied: ${applied.join(", ") || "ok"}.`,
      );
      setConfirmWarm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function statusBadge(key: string) {
    const st = data?.settings?.[key]?.status || "env_default";
    const variant = st === "pending_restart" ? "warning" : st === "applied" ? "success" : "outline";
    return <Badge variant={variant}>{st.replace("_", " ")}</Badge>;
  }

  return (
    <div className="space-y-6">
      {error ? (
        <Alert variant="danger" title="Settings">
          {error}
        </Alert>
      ) : null}
      {banner ? (
        <Alert variant="success" title="Saved">
          {banner}
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Account access {statusBadge("allowed_facebook")}</CardTitle>
          <CardDescription>
            Bare usernames only. Managed lists intersect environment allowlists and never expand them. Empty managed
            override means deny-all; clearing the override restores env-only policy.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="fb-allow">Facebook usernames</Label>
            <textarea
              id="fb-allow"
              className="mt-1 min-h-28 w-full rounded-md border border-[var(--border)] bg-transparent p-2 font-mono text-sm"
              value={fbAllow}
              onChange={(e) => setFbAllow(e.target.value)}
              placeholder={"cern\nesa"}
            />
          </div>
          <div>
            <Label htmlFor="ig-allow">Instagram usernames</Label>
            <textarea
              id="ig-allow"
              className="mt-1 min-h-28 w-full rounded-md border border-[var(--border)] bg-transparent p-2 font-mono text-sm"
              value={igAllow}
              onChange={(e) => setIgAllow(e.target.value)}
              placeholder={"nasa\nnatgeo"}
            />
          </div>
          <div className="md:col-span-2">
            <Button
              disabled={saving}
              onClick={() =>
                save({
                  allowed_facebook: textToList(fbAllow),
                  allowed_instagram: textToList(igAllow),
                })
              }
            >
              Save allowlists
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Caching {statusBadge("fresh_ttl_seconds")}</CardTitle>
          <CardDescription>Fresh TTL controls when public clients receive stale-cache and background refresh.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="ttl">Fresh TTL (seconds)</Label>
            <Input id="ttl" value={ttl} onChange={(e) => setTtl(e.target.value)} className="w-40" />
          </div>
          <Button
            disabled={saving}
            onClick={() => save({ fresh_ttl_seconds: Number.parseInt(ttl, 10) })}
          >
            Save TTL
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Usage protection {statusBadge("apify_daily_run_limit")}</CardTitle>
          <CardDescription>
            Local daily attempt budget. Ceiling from env: {data?.readOnly?.apifyDailyCeiling ?? "—"}. Dashboard may
            lower only. Manual quota reset is not available in MVP. Per-run charge cap (read-only):{" "}
            {data?.readOnly?.apifyMaxChargeUsdPerRun ?? "not configured"}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="daily">Effective daily limit</Label>
            <Input id="daily" value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} className="w-40" />
          </div>
          <Button
            disabled={saving}
            onClick={() => save({ apify_daily_run_limit: Number.parseInt(dailyLimit, 10) })}
          >
            Save limit
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Instagram enrichment {statusBadge("instagram_profile_enrichment")}
          </CardTitle>
          <CardDescription>
            Optional profile Actor for logos/names. Shares the local Apify attempt budget. Disabled by default.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={enrichment} onChange={(e) => setEnrichment(e.target.checked)} />
            Enable profile enrichment
          </label>
          <Button disabled={saving} onClick={() => save({ instagram_profile_enrichment: enrichment })}>
            Save enrichment
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Cache warming {statusBadge("warm_enabled")}</CardTitle>
          <CardDescription>
            Disabled by default. Saving lists does not scrape. Enabling may consume local Apify attempts after restart.
            Warm setting changes require an API process restart.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={warmEnabled} onChange={(e) => setWarmEnabled(e.target.checked)} />
            Enable warmer (restart required)
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="warm-fb">Facebook warm list</Label>
              <textarea
                id="warm-fb"
                className="mt-1 min-h-24 w-full rounded-md border border-[var(--border)] bg-transparent p-2 font-mono text-sm"
                value={warmFb}
                onChange={(e) => setWarmFb(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="warm-ig">Instagram warm list</Label>
              <textarea
                id="warm-ig"
                className="mt-1 min-h-24 w-full rounded-md border border-[var(--border)] bg-transparent p-2 font-mono text-sm"
                value={warmIg}
                onChange={(e) => setWarmIg(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <div>
              <Label htmlFor="warm-int">Interval (seconds)</Label>
              <Input id="warm-int" value={warmInterval} onChange={(e) => setWarmInterval(e.target.value)} className="w-36" />
            </div>
            <div>
              <Label htmlFor="warm-conc">Concurrency</Label>
              <Input
                id="warm-conc"
                value={warmConcurrency}
                onChange={(e) => setWarmConcurrency(e.target.value)}
                className="w-28"
              />
            </div>
          </div>
          {warmEnabled ? (
            <label className="flex items-center gap-2 text-sm text-[var(--warning)]">
              <input type="checkbox" checked={confirmWarm} onChange={(e) => setConfirmWarm(e.target.checked)} />
              I understand enabling warming may use Apify credit after restart
            </label>
          ) : null}
          <Button
            disabled={saving || (warmEnabled && !confirmWarm)}
            onClick={() =>
              save(
                {
                  warm_enabled: warmEnabled,
                  warm_facebook: textToList(warmFb),
                  warm_instagram: textToList(warmIg),
                  warm_interval_seconds: Number.parseInt(warmInterval, 10),
                  warm_concurrency: Number.parseInt(warmConcurrency, 10),
                },
                { confirmWarmEnable: warmEnabled && confirmWarm },
              )
            }
          >
            Save warming (restart required)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
