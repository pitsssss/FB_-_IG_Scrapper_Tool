"use client";

import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { getCsrfToken } from "@/lib/auth/client-csrf";

export type SecurityStatus = {
  id: number;
  username: string;
  email?: string | null;
  emailPending?: string | null;
  emailVerified?: boolean;
  smtpConfigured?: boolean;
  totpEnabled?: boolean;
  recoveryCodesRemaining?: number;
};

async function securityAction(action: string, payload: Record<string, unknown> = {}) {
  const csrf = getCsrfToken();
  const res = await fetch("/api/auth/security", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(csrf ? { "x-csrf-token": csrf } : {}),
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

type Props = {
  initialStatus: SecurityStatus | null;
};

export function AccountSecurityPanel({ initialStatus }: Props) {
  const [status, setStatus] = useState<SecurityStatus | null>(initialStatus);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [emailCode, setEmailCode] = useState("");

  const [totpPassword, setTotpPassword] = useState("");
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [otpauthUrl, setOtpauthUrl] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");

  async function refresh() {
    const res = await fetch("/api/auth/security", { method: "GET", cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body?.data) setStatus(body.data as SecurityStatus);
  }

  async function run(action: string, payload: Record<string, unknown>) {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const result = await securityAction(action, payload);
      if (!result.ok) {
        setError(result.body?.error?.message || "Request failed");
        return null;
      }
      if (result.body?.data?.recoveryCodes) {
        setRecoveryCodes(result.body.data.recoveryCodes as string[]);
      }
      if (result.body?.data?.secret) {
        setTotpSecret(result.body.data.secret as string);
        setOtpauthUrl((result.body.data.otpauthUrl as string) || null);
      }
      if (result.body?.data?.message) setInfo(String(result.body.data.message));
      if (result.body?.data?.admin) setStatus(result.body.data.admin as SecurityStatus);
      else await refresh();
      return result.body;
    } catch {
      setError("Unable to reach authentication service");
      return null;
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? (
        <Alert variant="danger" title="Security action failed">
          {error}
        </Alert>
      ) : null}
      {info ? (
        <Alert variant="info" title="Updated">
          {info}
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Account identity</CardTitle>
          <CardDescription>
            {status
              ? `${status.email || status.username}${status.emailVerified ? " · verified" : status.email ? " · not verified" : " · legacy username"}`
              : "Loading…"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-[var(--muted-foreground)]">
          <p>SMTP configured: {status?.smtpConfigured ? "yes" : "no"}</p>
          <p>Authenticator MFA: {status?.totpEnabled ? "enabled" : "disabled"}</p>
          <p>Recovery codes remaining: {status?.recoveryCodesRemaining ?? 0}</p>
          {status?.emailPending ? <p>Pending verification: {status.emailPending}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email enrollment</CardTitle>
          <CardDescription>
            Authenticated change of login email. Verification OTP is sent only when SMTP is configured.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="sec-email">Email</Label>
            <Input id="sec-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sec-email-pwd">Current password</Label>
            <Input
              id="sec-email-pwd"
              type="password"
              autoComplete="current-password"
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
              disabled={loading}
            />
          </div>
          <Button
            type="button"
            disabled={loading || !email || !emailPassword}
            onClick={() => void run("enrollEmail", { email, currentPassword: emailPassword })}
          >
            Save email
          </Button>
          <div className="space-y-2 pt-2">
            <Label htmlFor="sec-email-code">Verification code</Label>
            <Input id="sec-email-code" value={emailCode} onChange={(e) => setEmailCode(e.target.value)} disabled={loading} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={loading || !emailCode} onClick={() => void run("verifyEmail", { code: emailCode })}>
              Verify email
            </Button>
            <Button type="button" variant="secondary" disabled={loading} onClick={() => void run("resendEmail", {})}>
              Resend code
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Authenticator MFA</CardTitle>
          <CardDescription>Works without SMTP. Requires DATA_ENCRYPTION_KEY on the API host.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!status?.totpEnabled ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="totp-pwd">Current password</Label>
                <Input
                  id="totp-pwd"
                  type="password"
                  value={totpPassword}
                  onChange={(e) => setTotpPassword(e.target.value)}
                  disabled={loading}
                />
              </div>
              <Button
                type="button"
                disabled={loading || !totpPassword}
                onClick={() => void run("totpStart", { currentPassword: totpPassword })}
              >
                Start enrollment
              </Button>
              {totpSecret ? (
                <Alert variant="info" title="Add to authenticator">
                  <p className="mb-2 break-all font-mono text-xs">{totpSecret}</p>
                  {otpauthUrl ? (
                    <p className="break-all text-xs opacity-80">{otpauthUrl}</p>
                  ) : null}
                </Alert>
              ) : null}
              <div className="space-y-2">
                <Label htmlFor="totp-code">Confirm with code</Label>
                <Input id="totp-code" value={totpCode} onChange={(e) => setTotpCode(e.target.value)} disabled={loading} />
              </div>
              <Button type="button" disabled={loading || !totpCode} onClick={() => void run("totpConfirm", { code: totpCode })}>
                Enable MFA
              </Button>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="disable-pwd">Current password</Label>
                <Input
                  id="disable-pwd"
                  type="password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="disable-code">Authenticator or recovery code</Label>
                <Input id="disable-code" value={disableCode} onChange={(e) => setDisableCode(e.target.value)} disabled={loading} />
              </div>
              <Button
                type="button"
                variant="danger"
                disabled={loading || !disablePassword || !disableCode}
                onClick={() => void run("totpDisable", { currentPassword: disablePassword, code: disableCode })}
              >
                Disable MFA
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={loading || !disablePassword || !disableCode}
                onClick={() =>
                  void run("recoveryCodes", { currentPassword: disablePassword, code: disableCode })
                }
              >
                Regenerate recovery codes
              </Button>
            </>
          )}
          {recoveryCodes ? (
            <Alert variant="warning" title="Store these recovery codes offline">
              <ul className="mt-2 space-y-1 font-mono text-xs">
                {recoveryCodes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>Revokes all other sessions after a successful change.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="cur-pwd">Current password</Label>
            <Input
              id="cur-pwd"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-pwd">New password</Label>
            <Input
              id="new-pwd"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-pwd">Confirm password</Label>
            <Input
              id="confirm-pwd"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={loading}
            />
          </div>
          <Button
            type="button"
            disabled={loading || !currentPassword || !newPassword}
            onClick={() =>
              void run("changePassword", {
                currentPassword,
                newPassword,
                confirmPassword,
              })
            }
          >
            Update password
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
