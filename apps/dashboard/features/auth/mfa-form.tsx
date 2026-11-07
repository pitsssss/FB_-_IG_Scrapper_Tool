"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { getCsrfToken } from "@/lib/auth/client-csrf";

export function MfaForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const csrf = getCsrfToken();
      const res = await fetch("/api/auth/mfa", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(csrf ? { "x-csrf-token": csrf } : {}),
        },
        body: JSON.stringify({ code: code.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error?.message || "Verification failed");
        return;
      }
      router.replace("/overview");
      router.refresh();
    } catch {
      setError("Unable to reach authentication service");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Two-factor authentication</CardTitle>
        <CardDescription>Enter a code from your authenticator app or a recovery code</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          {error ? (
            <Alert variant="danger" title="Could not verify">
              {error}
            </Alert>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="mfa-code">Authentication code</Label>
            <Input
              id="mfa-code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={loading}
              placeholder="6-digit or recovery code"
            />
          </div>
          <Button type="submit" disabled={loading || !code.trim()}>
            {loading ? "Verifying…" : "Continue"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
