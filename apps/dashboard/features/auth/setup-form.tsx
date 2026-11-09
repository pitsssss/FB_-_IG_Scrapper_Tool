"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { navigateAfterAuth } from "@/lib/auth/client-navigate";

type Props = {
  setupAvailable: boolean;
  setupRequired: boolean;
  message: string;
  smtpConfigured?: boolean;
};

export function SetupForm({ setupAvailable, setupRequired, message, smtpConfigured }: Props) {
  const [setupToken, setSetupToken] = useState("");
  const [email, setEmail] = useState("");
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
    if (loading) return;
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
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ setupToken, email, password, confirmPassword }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error?.message || "Setup failed");
        setLoading(false);
        return;
      }
      navigateAfterAuth("/overview");
    } catch {
      setError("Unable to reach authentication service");
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create administrator account</CardTitle>
        <CardDescription>One-time bootstrap · single administrator per deployment</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          {error ? (
            <Alert variant="danger" title="Setup failed">
              {error}
            </Alert>
          ) : null}
          {smtpConfigured ? (
            <Alert variant="info" title="Email verification available">
              SMTP is configured. After setup you can verify the administrator email from Account security.
            </Alert>
          ) : (
            <Alert variant="info" title="SMTP optional">
              Email delivery is not configured. You can still create the account and enable authenticator MFA without SMTP.
            </Alert>
          )}
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
            <Label htmlFor="admin-email">Administrator email</Label>
            <Input
              id="admin-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-password">Password</Label>
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
            {loading ? "Creating…" : "Create administrator"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
