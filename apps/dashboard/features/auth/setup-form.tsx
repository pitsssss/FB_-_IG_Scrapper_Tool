"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";

type Props = {
  setupAvailable: boolean;
  setupRequired: boolean;
  message: string;
};

export function SetupForm({ setupAvailable, setupRequired, message }: Props) {
  const router = useRouter();
  const [setupToken, setSetupToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!setupRequired) {
    return (
      <Alert variant="info" title="Setup already complete">
        An administrator already exists. Use the login page instead.
      </Alert>
    );
  }

  if (!setupAvailable) {
    return (
      <Alert variant="warning" title="Setup not configured">
        {message ||
          "Set a cryptographically random BOOTSTRAP_SETUP_TOKEN on the API host, restart the API, then return here. Public registration is disabled."}
      </Alert>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 12) {
      setError("Password must be at least 12 characters");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setupToken, username, password, confirmPassword }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error?.message || "Setup failed");
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
        <CardTitle>Create administrator</CardTitle>
        <CardDescription>One-time bootstrap · single administrator</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          {error ? (
            <Alert variant="danger" title="Setup failed">
              {error}
            </Alert>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="bootstrap">Bootstrap setup token</Label>
            <Input
              id="bootstrap"
              name="setupToken"
              autoComplete="off"
              required
              value={setupToken}
              onChange={(e) => setSetupToken(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="username">Administrator username</Label>
            <Input
              id="username"
              name="username"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-password">Administrator password</Label>
            <Input
              id="admin-password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-password-confirm">Confirm password</Label>
            <Input
              id="admin-password-confirm"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
            />
          </div>
          <Button type="submit" disabled={loading}>
            {loading ? "Creating…" : "Complete setup"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
