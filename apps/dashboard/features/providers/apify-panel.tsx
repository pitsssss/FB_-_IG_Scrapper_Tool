"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { StatusIndicator } from "@/components/ui/status-indicator";

type ProviderStatus = {
  connected: boolean;
  source: string;
  managedStatus: string;
  usernameHint?: string | null;
  lastVerifiedAt?: string | null;
  lastVerifyOk?: boolean | null;
  lastVerifyCode?: string | null;
  envTokenConfigured?: boolean;
  envFallbackSuppressed?: boolean;
};

function toneFor(status: ProviderStatus | null) {
  if (!status) return "unknown" as const;
  if (status.connected) return "ok" as const;
  if (status.source === "disconnected") return "warn" as const;
  if (status.source === "invalid") return "error" as const;
  return "idle" as const;
}

export function ApifyPanel() {
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [bootLoading, setBootLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/management/provider");
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body?.error?.message || "Could not load provider status");
      return;
    }
    setStatus(body.data as ProviderStatus);
    setError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await refresh();
      } finally {
        if (!cancelled) setBootLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  async function post(action: string) {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/management/provider", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, token }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error?.message || "Request failed");
        return;
      }
      if (action === "validate") {
        setInfo(`Token looks valid (${body.data?.usernameHint || "connected"}). Not a balance check.`);
      } else if (action === "connect") {
        setInfo("Apify token saved and activated for new requests.");
        setToken("");
      } else if (action === "disconnect") {
        setInfo("Managed token disconnected. Environment fallback stays suppressed.");
        setToken("");
      }
      await refresh();
    } catch {
      setError("Unable to reach management API");
    } finally {
      setLoading(false);
    }
  }

  function onDisconnect() {
    if (!window.confirm("Disconnect the managed Apify token? Live scrapes will stop unless you reconnect. Environment APIFY_TOKEN will not be reactivated automatically.")) {
      return;
    }
    void post("disconnect");
  }

  const label = !status
    ? "Loading…"
    : status.connected
      ? `Connected (${status.source})`
      : status.source === "disconnected"
        ? "Disconnected"
        : status.source === "environment"
          ? "Using environment token"
          : "Not connected";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Apify</CardTitle>
          <CardDescription>
            Facebook and Instagram Actors share one local attempt budget. Token validation does not prove available credit.
          </CardDescription>
        </div>
        <Badge variant="outline">BYO account</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {bootLoading ? <p className="text-sm text-[var(--muted-foreground)]">Loading status…</p> : null}
        <StatusIndicator
          tone={toneFor(status)}
          label={label}
          detail={[
            status?.usernameHint ? `Account hint: ${status.usernameHint}` : null,
            status?.lastVerifiedAt ? `Last verified: ${status.lastVerifiedAt}` : null,
            status?.envTokenConfigured ? "Environment APIFY_TOKEN is configured on the API host" : null,
            status?.envFallbackSuppressed ? "Environment fallback is suppressed after disconnect" : null,
          ]
            .filter(Boolean)
            .join(" · ") || undefined}
        />

        {error ? (
          <Alert variant="danger" title="Provider error">
            {error}
          </Alert>
        ) : null}
        {info ? (
          <Alert variant="success" title="Updated">
            {info}
          </Alert>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="apify-token">Apify API token</Label>
          <Input
            id="apify-token"
            name="apifyToken"
            type="password"
            autoComplete="off"
            placeholder="Paste a new token (never shown after save)"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            disabled={loading}
          />
          <p className="text-xs text-[var(--muted-foreground)]">
            Stored with AES-256-GCM using DATA_ENCRYPTION_KEY. The saved token is never returned to the browser.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={loading || !token} onClick={() => void post("connect")}>
            {status?.connected && status.source === "managed" ? "Replace token" : "Connect Apify"}
          </Button>
          <Button type="button" variant="outline" disabled={loading || !token} onClick={() => void post("validate")}>
            Verify token
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={loading || status?.source !== "managed"}
            onClick={onDisconnect}
          >
            Disconnect
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
