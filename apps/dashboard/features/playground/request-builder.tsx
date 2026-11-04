"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError, Input, Label } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { validateUsername, type Platform } from "@/lib/utils/username";
import { cn } from "@/lib/utils/cn";

type Mode = "cache" | "live";

export function PlaygroundRequestBuilder() {
  const [platform, setPlatform] = useState<Platform>("facebook");
  const [username, setUsername] = useState("");
  const [limit, setLimit] = useState("10");
  const [mode, setMode] = useState<Mode>("cache");
  const [touched, setTouched] = useState(false);

  const validation = useMemo(
    () => validateUsername(platform, username),
    [platform, username],
  );

  const limitNum = Number.parseInt(limit, 10);
  const limitOk = Number.isFinite(limitNum) && limitNum >= 1 && limitNum <= 50;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Request builder</CardTitle>
          <CardDescription>
            Local UI validation only. Execution requires authenticated management APIs in Phase 7C/7D.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
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
              name="username"
              autoComplete="off"
              placeholder={platform === "facebook" ? "cern" : "nasa"}
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setTouched(true);
              }}
              onBlur={() => setTouched(true)}
              aria-invalid={touched && !validation.ok}
              aria-describedby="username-help username-error"
            />
            <p id="username-help" className="text-xs text-[var(--muted-foreground)]">
              Bare username only — not a full profile URL.
            </p>
            <div id="username-error">
              <FieldError>{touched && !validation.ok ? validation.message : null}</FieldError>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="playground-limit">Limit</Label>
            <Input
              id="playground-limit"
              name="limit"
              inputMode="numeric"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              aria-invalid={!limitOk}
            />
            {!limitOk ? <FieldError>Enter an integer between 1 and 50</FieldError> : null}
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Mode</legend>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={mode === "cache" ? "default" : "outline"}
                onClick={() => setMode("cache")}
                aria-pressed={mode === "cache"}
              >
                Cache only
              </Button>
              <Button
                type="button"
                variant={mode === "live" ? "default" : "outline"}
                onClick={() => setMode("live")}
                aria-pressed={mode === "live"}
              >
                Live refresh
              </Button>
            </div>
            {mode === "live" ? (
              <Alert className="mt-3" variant="warning" title="Live refresh unavailable">
                Live refresh can consume Apify quota. It stays disabled until authenticated admin APIs and
                explicit confirmation land in later phases.
              </Alert>
            ) : (
              <Alert className="mt-3" variant="info" title="Cache-only unavailable">
                Cache reads also require the authenticated BFF. This control only records your intent for now.
              </Alert>
            )}
          </fieldset>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" disabled aria-disabled="true" title="Execution not available in Phase 7B">
              Send request
            </Button>
            <Badge variant="outline">Disabled — no BFF</Badge>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Response preview</CardTitle>
            <CardDescription>Visual posts will render here after 7D.</CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState
              title="No response yet"
              description="Execution is intentionally unavailable. No mock posts are shown as real data."
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Raw JSON</CardTitle>
            <CardDescription>Success and error envelopes from the public contract.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre
              className={cn(
                "min-h-40 overflow-auto rounded-md border border-[var(--border)] bg-[var(--code-bg)] p-3 font-mono text-xs text-[var(--muted-foreground)]",
              )}
            >
              {"// awaiting authenticated request"}
            </pre>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Response metadata</CardTitle>
          <CardDescription>
            Planned fields: source, provider, fetched_at, cache_age_seconds, stale, warning, status.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState title="No metadata" description="Nothing to display until a real request is executed." />
        </CardContent>
      </Card>
    </div>
  );
}
