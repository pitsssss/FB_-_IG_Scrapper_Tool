"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, KeyRound, Plus } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label } from "@/components/ui/input";

type KeyMeta = {
  id?: number;
  clientName: string;
  keyPrefix: string;
  createdAt?: string;
  lastUsedAt?: string | null;
  revoked?: boolean;
  source: string;
  readOnly?: boolean;
  scopes?: { facebook?: string[]; instagram?: string[]; note?: string };
  scopeCount?: number;
};

function parseList(raw: string) {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function ApiKeysManager() {
  const [managed, setManaged] = useState<KeyMeta[]>([]);
  const [environment, setEnvironment] = useState<KeyMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [boot, setBoot] = useState(true);

  const [clientName, setClientName] = useState("");
  const [fbScopes, setFbScopes] = useState("");
  const [igScopes, setIgScopes] = useState("");
  const [oneTimeKey, setOneTimeKey] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/management/api-keys");
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body?.error?.message || "Could not load API keys");
      return;
    }
    setManaged(body.data?.managed || []);
    setEnvironment(body.data?.environment || []);
    setError(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await refresh();
      } finally {
        if (!cancelled) setBoot(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/management/api-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          clientName,
          scopes: { facebook: parseList(fbScopes), instagram: parseList(igScopes) },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error?.message || "Create failed");
        return;
      }
      setOneTimeKey(body.data?.key || null);
      setClientName("");
      setFbScopes("");
      setIgScopes("");
      setShowCreate(false);
      await refresh();
    } catch {
      setError("Unable to reach management API");
    } finally {
      setLoading(false);
    }
  }

  async function act(id: number, action: string, scopes?: { facebook: string[]; instagram: string[] }) {
    if (action === "revoke" && !window.confirm("Revoke this API key immediately?")) return;
    if (action === "rotate" && !window.confirm("Rotate this key? The old secret stops working immediately.")) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/management/api-keys/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, scopes }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error?.message || "Action failed");
        return;
      }
      if (body.data?.key) setOneTimeKey(body.data.key);
      await refresh();
    } catch {
      setError("Unable to reach management API");
    } finally {
      setLoading(false);
    }
  }

  async function copyKey() {
    if (!oneTimeKey) return;
    try {
      await navigator.clipboard.writeText(oneTimeKey);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="danger" title="API keys">
          {error}
        </Alert>
      ) : null}

      {oneTimeKey ? (
        <Alert variant="warning" title="Copy this key now">
          <p className="mb-2 break-all font-mono text-xs text-[var(--foreground)]">{oneTimeKey}</p>
          <p className="mb-3 text-xs">It will not be shown again. Closing clears it from this page.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => void copyKey()}>
              <Copy className="h-3.5 w-3.5" />
              Copy
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setOneTimeKey(null)}>
              Done
            </Button>
          </div>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted-foreground)]">
          Managed keys are hashed at rest. Environment keys stay read-only.
        </p>
        <Button type="button" onClick={() => setShowCreate((v) => !v)} disabled={loading}>
          <Plus className="h-4 w-4" />
          Create key
        </Button>
      </div>

      {showCreate ? (
        <Card>
          <CardHeader>
            <CardTitle>New API key</CardTitle>
            <CardDescription>Deny-by-default scopes — add at least one Facebook or Instagram username.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={createKey}>
              <div className="space-y-2">
                <Label htmlFor="client-name">Client name</Label>
                <Input id="client-name" value={clientName} onChange={(e) => setClientName(e.target.value)} required disabled={loading} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fb-scopes">Facebook usernames</Label>
                <Input
                  id="fb-scopes"
                  placeholder="cern nasa"
                  value={fbScopes}
                  onChange={(e) => setFbScopes(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ig-scopes">Instagram usernames</Label>
                <Input
                  id="ig-scopes"
                  placeholder="nasa"
                  value={igScopes}
                  onChange={(e) => setIgScopes(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={loading}>
                  Create
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Managed keys</CardTitle>
          <CardDescription>Create, scope, rotate, revoke</CardDescription>
        </CardHeader>
        <CardContent>
          {boot ? (
            <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>
          ) : managed.length === 0 ? (
            <EmptyState
              icon={<KeyRound className="h-8 w-8" />}
              title="No managed keys"
              description="Create a key to let website backends call the posts API."
            />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {managed.map((k) => (
                <li key={k.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{k.clientName}</p>
                      <Badge variant={k.revoked ? "outline" : "default"}>{k.revoked ? "Revoked" : "Active"}</Badge>
                      <span className="font-mono text-xs text-[var(--muted-foreground)]">{k.keyPrefix}…</span>
                    </div>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      FB: {(k.scopes?.facebook || []).join(", ") || "—"} · IG:{" "}
                      {(k.scopes?.instagram || []).join(", ") || "—"}
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      Created {k.createdAt || "—"}
                      {k.lastUsedAt ? ` · Last used ${k.lastUsedAt}` : ""}
                    </p>
                  </div>
                  {!k.revoked && k.id ? (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={loading}
                        onClick={() => {
                          const fb = window.prompt("Facebook usernames (space-separated)", (k.scopes?.facebook || []).join(" "));
                          if (fb === null) return;
                          const ig = window.prompt("Instagram usernames (space-separated)", (k.scopes?.instagram || []).join(" "));
                          if (ig === null) return;
                          void act(k.id!, "scopes", { facebook: parseList(fb), instagram: parseList(ig) });
                        }}
                      >
                        Edit scopes
                      </Button>
                      <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void act(k.id!, "rotate")}>
                        Rotate
                      </Button>
                      <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void act(k.id!, "revoke")}>
                        Revoke
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Environment keys</CardTitle>
          <CardDescription>From API_KEYS — read-only in the dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          {environment.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">No environment API_KEYS configured.</p>
          ) : (
            <ul className="space-y-3">
              {environment.map((k) => (
                <li key={k.clientName} className="rounded-md border border-[var(--border)] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{k.clientName}</p>
                    <Badge variant="outline">Environment</Badge>
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    {k.scopes?.note ||
                      `FB: ${(k.scopes?.facebook || []).join(", ") || "—"} · IG: ${(k.scopes?.instagram || []).join(", ") || "—"}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
