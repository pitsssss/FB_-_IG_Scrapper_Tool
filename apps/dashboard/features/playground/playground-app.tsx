"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { validateUsername, type Platform } from "@/lib/utils/username";
import { getCsrfToken } from "@/lib/auth/client-csrf";
import { cn } from "@/lib/utils/cn";
import type { Post, PageIdentity, PostsMeta } from "@/types/api";
import { AccountHeader, PostCard } from "@/features/playground/post-card";

type Mode = "cache" | "live";
type Tab = "preview" | "json" | "request" | "meta";

type ConfirmData = {
  confirmationToken: string;
  expiresAt: string;
  expiresInSeconds: number;
  platform: string;
  username: string;
  limit: number;
  quota?: Record<string, unknown>;
  warning?: string;
};

type ResultState = {
  ok: boolean;
  status: number;
  durationMs: number;
  mode: Mode;
  body: unknown;
  page?: PageIdentity | null;
  posts?: Post[];
  meta?: PostsMeta & { mode?: string; platform?: string; username?: string };
  error?: { code: string; message: string };
};

export function PlaygroundApp({ maxPosts = 10 }: { maxPosts?: number }) {
  const [platform, setPlatform] = useState<Platform>("facebook");
  const [username, setUsername] = useState("");
  const [limit, setLimit] = useState("10");
  const [mode, setMode] = useState<Mode>("cache");
  const [touched, setTouched] = useState(false);
  const [tab, setTab] = useState<Tab>("preview");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ResultState | null>(null);
  const [confirm, setConfirm] = useState<ConfirmData | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const validation = useMemo(() => validateUsername(platform, username), [platform, username]);
  const limitNum = Number.parseInt(limit, 10);
  const limitOk = Number.isFinite(limitNum) && limitNum >= 1 && limitNum <= maxPosts;

  async function readCache() {
    setBanner(null);
    setConfirm(null);
    setLoading(true);
    const started = performance.now();
    try {
      const qs = new URLSearchParams({
        platform,
        username: username.trim(),
        limit: String(limitNum),
      });
      const res = await fetch(`/api/management/playground?${qs}`, { method: "GET", cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      const durationMs = Math.round(performance.now() - started);
      if (!res.ok || body?.success === false) {
        setResult({
          ok: false,
          status: res.status,
          durationMs,
          mode: "cache",
          body,
          error: body?.error || { code: "REQUEST_FAILED", message: "Cache read failed" },
        });
        setTab("json");
        return;
      }
      setResult({
        ok: true,
        status: res.status,
        durationMs,
        mode: "cache",
        body,
        page: body?.data?.page || null,
        posts: body?.data?.posts || [],
        meta: body?.meta,
      });
      setTab("preview");
    } catch {
      setResult({
        ok: false,
        status: 0,
        durationMs: Math.round(performance.now() - started),
        mode: "cache",
        body: null,
        error: { code: "NETWORK", message: "Unable to reach management API" },
      });
    } finally {
      setLoading(false);
    }
  }

  async function playgroundAction(action: string, payload: Record<string, unknown> = {}) {
    const csrf = getCsrfToken();
    const res = await fetch("/api/management/playground", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(csrf ? { "x-csrf-token": csrf } : {}),
      },
      body: JSON.stringify({ action, ...payload }),
    });
    const body = await res.json().catch(() => ({}));
    return { res, body };
  }

  async function prepareLive() {
    setBanner(null);
    setLoading(true);
    try {
      const { res, body } = await playgroundAction("prepare", {
        platform,
        username: username.trim(),
        limit: limitNum,
      });
      if (!res.ok || !body?.success) {
        setResult({
          ok: false,
          status: res.status,
          durationMs: 0,
          mode: "live",
          body,
          error: body?.error || { code: "PREPARE_FAILED", message: "Could not prepare live refresh" },
        });
        setConfirm(null);
        setTab("json");
        return;
      }
      setConfirm(body.data as ConfirmData);
      setBanner(body.data?.warning || "Confirm to reserve one local Apify attempt.");
    } catch {
      setBanner("Unable to prepare live refresh");
    } finally {
      setLoading(false);
    }
  }

  async function cancelLive() {
    if (!confirm) return;
    setLoading(true);
    try {
      await playgroundAction("cancel", { confirmationToken: confirm.confirmationToken });
      setConfirm(null);
      setBanner("Live refresh cancelled. No provider calls were made.");
    } finally {
      setLoading(false);
    }
  }

  async function confirmLive() {
    if (!confirm) return;
    setLoading(true);
    const started = performance.now();
    const token = confirm.confirmationToken;
    try {
      const { res, body } = await playgroundAction("confirm", { confirmationToken: token });
      const durationMs = Math.round(performance.now() - started);
      setConfirm(null);
      if (!res.ok || body?.success === false) {
        setResult({
          ok: false,
          status: res.status,
          durationMs,
          mode: "live",
          body,
          error: body?.error || { code: "REFRESH_FAILED", message: "Live refresh failed" },
        });
        setTab("json");
        return;
      }
      setResult({
        ok: true,
        status: res.status,
        durationMs,
        mode: "live",
        body,
        page: body?.data?.page || null,
        posts: body?.data?.posts || [],
        meta: body?.meta,
      });
      setTab("preview");
      setBanner("Live refresh completed.");
    } catch {
      setBanner("Unable to confirm live refresh");
    } finally {
      setLoading(false);
    }
  }

  function copyJson() {
    if (!result) return;
    void navigator.clipboard?.writeText(JSON.stringify(result.body, null, 2));
  }

  const sourceLabel = result?.meta?.source
    ? String(result.meta.source).toUpperCase().replace("-", " ")
    : result?.mode === "live"
      ? "LIVE"
      : result
        ? "CACHE"
        : null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Request builder</CardTitle>
          <CardDescription>
            Cache Only is default and never contacts providers. Live Refresh requires explicit server-side confirmation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {banner ? (
            <Alert variant="info" title="Status">
              {banner}
            </Alert>
          ) : null}

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Platform</legend>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Platform">
              {(["facebook", "instagram"] as const).map((p) => (
                <Button
                  key={p}
                  type="button"
                  variant={platform === p ? "default" : "outline"}
                  onClick={() => setPlatform(p)}
                  aria-pressed={platform === p}
                  disabled={loading}
                >
                  {p === "facebook" ? "Facebook" : "Instagram"}
                </Button>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <Label htmlFor="playground-username">Username</Label>
            <Input
              id="playground-username"
              autoComplete="off"
              placeholder={platform === "facebook" ? "cern" : "nasa"}
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setTouched(true);
              }}
              onBlur={() => setTouched(true)}
              aria-invalid={touched && !validation.ok}
              disabled={loading}
            />
            <FieldError>{touched && !validation.ok ? validation.message : null}</FieldError>
          </div>

          <div className="space-y-2">
            <Label htmlFor="playground-limit">Limit (max {maxPosts})</Label>
            <Input
              id="playground-limit"
              inputMode="numeric"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              aria-invalid={!limitOk}
              disabled={loading}
            />
            {!limitOk ? <FieldError>Enter an integer between 1 and {maxPosts}</FieldError> : null}
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Mode</legend>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={mode === "cache" ? "default" : "outline"}
                onClick={() => setMode("cache")}
                aria-pressed={mode === "cache"}
                disabled={loading}
              >
                Cache only
              </Button>
              <Button
                type="button"
                variant={mode === "live" ? "default" : "outline"}
                onClick={() => setMode("live")}
                aria-pressed={mode === "live"}
                disabled={loading}
              >
                Live refresh
              </Button>
            </div>
          </fieldset>

          <div className="flex flex-wrap gap-3">
            {mode === "cache" ? (
              <Button
                type="button"
                disabled={loading || !validation.ok || !limitOk}
                onClick={() => void readCache()}
              >
                {loading ? "Reading…" : "Read cache"}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  disabled={loading || !validation.ok || !limitOk || Boolean(confirm)}
                  onClick={() => void prepareLive()}
                >
                  {loading && !confirm ? "Preparing…" : "Prepare live refresh"}
                </Button>
              </>
            )}
          </div>

          {confirm ? (
            <Alert variant="warning" title="Confirm paid-capable refresh">
              <p className="mb-2 text-sm">
                {confirm.platform}/{confirm.username} · limit {confirm.limit}
              </p>
              {confirm.quota ? (
                <p className="mb-3 text-xs">
                  Local attempts remaining: {String(confirm.quota.remaining ?? "—")} /{" "}
                  {String(confirm.quota.dailyLimit ?? "—")} (UTC {String(confirm.quota.todayUtc ?? "")})
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={loading} onClick={() => void confirmLive()}>
                  {loading ? "Refreshing…" : "Confirm refresh"}
                </Button>
                <Button type="button" variant="secondary" disabled={loading} onClick={() => void cancelLive()}>
                  Cancel
                </Button>
              </div>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Result views">
        {(
          [
            ["preview", "Visual preview"],
            ["json", "Raw JSON"],
            ["request", "Request details"],
            ["meta", "Response metadata"],
          ] as const
        ).map(([id, label]) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant={tab === id ? "default" : "outline"}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </Button>
        ))}
        {sourceLabel ? <Badge variant="outline">{sourceLabel}</Badge> : null}
      </div>

      {tab === "preview" ? (
        <Card>
          <CardHeader>
            <CardTitle>Visual preview</CardTitle>
            <CardDescription>Normalized posts from the management response only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!result ? (
              <EmptyState title="No response yet" description="Read cache or confirm a live refresh." />
            ) : result.error ? (
              <Alert variant="danger" title={result.error.code}>
                {result.error.message}
              </Alert>
            ) : (
              <>
                {result.page ? <AccountHeader page={result.page} /> : null}
                {result.posts?.length ? (
                  result.posts.map((p) => <PostCard key={p.id} post={p} />)
                ) : (
                  <EmptyState title="Zero posts" description="The response contained an empty posts array." />
                )}
              </>
            )}
          </CardContent>
        </Card>
      ) : null}

      {tab === "json" ? (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <div>
              <CardTitle>Raw JSON</CardTitle>
              <CardDescription>Exact envelope returned by the API.</CardDescription>
            </div>
            <Button type="button" size="sm" variant="secondary" disabled={!result} onClick={copyJson}>
              Copy JSON
            </Button>
          </CardHeader>
          <CardContent>
            <pre
              className={cn(
                "max-h-[28rem] overflow-auto rounded-md border border-[var(--border)] bg-[var(--code-bg)] p-3 font-mono text-xs",
              )}
            >
              {result ? JSON.stringify(result.body, null, 2) : "// awaiting request"}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      {tab === "request" ? (
        <Card>
          <CardHeader>
            <CardTitle>Request details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>Platform: {platform}</p>
            <p>Username: {username || "—"}</p>
            <p>Limit: {limit}</p>
            <p>Mode: {mode === "cache" ? "Cache only" : "Live refresh"}</p>
            <p>Path: {mode === "cache" ? "GET /api/v1/admin/playground/cache" : "POST /api/v1/admin/playground/*"}</p>
          </CardContent>
        </Card>
      ) : null}

      {tab === "meta" ? (
        <Card>
          <CardHeader>
            <CardTitle>Response metadata</CardTitle>
          </CardHeader>
          <CardContent>
            {!result ? (
              <EmptyState title="No metadata" description="Execute a request first." />
            ) : (
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-[var(--muted-foreground)]">HTTP status</dt>
                  <dd>{result.status}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted-foreground)]">Duration</dt>
                  <dd>{result.durationMs} ms</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted-foreground)]">Mode</dt>
                  <dd>{result.mode}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted-foreground)]">Source</dt>
                  <dd>{result.meta?.source ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted-foreground)]">Provider</dt>
                  <dd>{result.meta?.provider ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted-foreground)]">Fetched at</dt>
                  <dd>{result.meta?.fetched_at ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted-foreground)]">Cache age (s)</dt>
                  <dd>{result.meta?.cache_age_seconds ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted-foreground)]">Stale</dt>
                  <dd>{result.meta?.stale == null ? "—" : String(result.meta.stale)}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted-foreground)]">Count</dt>
                  <dd>{result.meta?.count ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-[var(--muted-foreground)]">Warning</dt>
                  <dd>{result.meta?.warning ?? "—"}</dd>
                </div>
                {result.error ? (
                  <div className="sm:col-span-2">
                    <dt className="text-[var(--muted-foreground)]">Error</dt>
                    <dd>
                      {result.error.code}: {result.error.message}
                    </dd>
                  </div>
                ) : null}
              </dl>
            )}
          </CardContent>
        </Card>
      ) : null}

    </div>
  );
}
