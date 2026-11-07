"use client";

import { useCallback, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { getCsrfToken } from "@/lib/auth/client-csrf";

type CacheEntry = {
  id: string;
  platform: string;
  username: string;
  postCount: number;
  fetchedAt: string | null;
  ageSeconds: number | null;
  freshness: string;
};

export function CacheManager({ initialEntries = [] }: { initialEntries?: CacheEntry[] }) {
  const [entries, setEntries] = useState<CacheEntry[]>(initialEntries);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [platform, setPlatform] = useState<"all" | "facebook" | "instagram">("all");
  const [query, setQuery] = useState("");
  const [freshness, setFreshness] = useState<"all" | "fresh" | "stale">("all");
  const [pending, setPending] = useState<CacheEntry | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const res = await fetch("/api/management/cache");
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error?.message || "Failed to load cache");
    setEntries(body.data?.entries || []);
  }, []);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (platform !== "all" && e.platform !== platform) return false;
      if (freshness !== "all" && e.freshness !== freshness) return false;
      if (query && !e.username.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [entries, platform, freshness, query]);

  async function confirmDelete() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/management/cache", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": getCsrfToken() || "",
        },
        body: JSON.stringify({
          platform: pending.platform,
          username: pending.username,
          confirm: true,
          currentPassword: password,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error?.message || "Delete failed");
      setMessage(body.data?.note || "Cache entry deleted.");
      setPending(null);
      setPassword("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="danger" title="Cache">
          {error}
        </Alert>
      ) : null}
      {message ? (
        <Alert variant="success" title="Deleted">
          {message}
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Cache entries</CardTitle>
          <CardDescription>
            Delete removes memory and disk for one account. No automatic refetch. Purge-all is not available.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div>
              <Label htmlFor="plat">Platform</Label>
              <select
                id="plat"
                className="mt-1 block rounded-md border border-[var(--border)] bg-transparent px-2 py-2 text-sm"
                value={platform}
                onChange={(e) => setPlatform(e.target.value as typeof platform)}
              >
                <option value="all">All</option>
                <option value="facebook">Facebook</option>
                <option value="instagram">Instagram</option>
              </select>
            </div>
            <div>
              <Label htmlFor="fresh">Freshness</Label>
              <select
                id="fresh"
                className="mt-1 block rounded-md border border-[var(--border)] bg-transparent px-2 py-2 text-sm"
                value={freshness}
                onChange={(e) => setFreshness(e.target.value as typeof freshness)}
              >
                <option value="all">All</option>
                <option value="fresh">Fresh</option>
                <option value="stale">Stale</option>
              </select>
            </div>
            <div className="min-w-[12rem] flex-1">
              <Label htmlFor="q">Username</Label>
              <Input id="q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter…" />
            </div>
            <div className="flex items-end">
              <Button variant="secondary" onClick={() => reload().catch((e) => setError(e.message))}>
                Refresh list
              </Button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">No matching cache entries.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <thead className="text-xs text-[var(--muted-foreground)]">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Platform</th>
                    <th className="py-2 pr-3 font-medium">Username</th>
                    <th className="py-2 pr-3 font-medium">Posts</th>
                    <th className="py-2 pr-3 font-medium">Freshness</th>
                    <th className="py-2 pr-3 font-medium">Fetched</th>
                    <th className="py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id} className="border-t border-[var(--border)]">
                      <td className="py-2 pr-3">{e.platform}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{e.username}</td>
                      <td className="py-2 pr-3">{e.postCount}</td>
                      <td className="py-2 pr-3">
                        <Badge variant="outline">{e.freshness}</Badge>
                      </td>
                      <td className="py-2 pr-3 text-xs text-[var(--muted-foreground)]">
                        {e.fetchedAt ? new Date(e.fetchedAt).toLocaleString() : "—"}
                      </td>
                      <td className="py-2">
                        <Button size="sm" variant="secondary" onClick={() => setPending(e)}>
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {pending ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cache-delete-title"
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
        >
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle id="cache-delete-title">Delete cache entry</CardTitle>
              <CardDescription>
                Delete {pending.platform}/{pending.username}? This removes memory and disk only. Future requests may
                re-fetch subject to quota. Re-enter your administrator password.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="pwd">Current password</Label>
                <Input
                  id="pwd"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setPending(null);
                    setPassword("");
                  }}
                >
                  Cancel
                </Button>
                <Button disabled={busy || !password} onClick={confirmDelete}>
                  {busy ? "Deleting…" : "Confirm delete"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
