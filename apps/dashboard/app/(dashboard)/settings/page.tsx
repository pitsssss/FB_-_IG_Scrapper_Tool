import { PageHeader } from "@/components/layout/page-header";
import { AccountSecurityPanel, type SecurityStatus } from "@/features/auth/account-security-panel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { adminApiFetch } from "@/lib/auth/api";
import { readSessionToken } from "@/lib/auth/cookies";
import { requireAdmin } from "@/lib/auth/session";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdmin();
  const token = await readSessionToken();
  let initialStatus: SecurityStatus | null = null;
  if (token) {
    const result = await adminApiFetch<SecurityStatus>("/api/v1/admin/security", {
      method: "GET",
      sessionToken: token,
    });
    if (result.ok && result.body.data) {
      initialStatus = result.body.data;
    }
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Administrator account security. Deployment env vars remain host-managed."
      />
      <div className="mb-8">
        <AccountSecurityPanel initialStatus={initialStatus} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Host configuration</CardTitle>
          <CardDescription>
            Cache TTL, provider order, and quota limits are still configured via environment variables on the API host.
            SMTP (optional) uses SMTP_HOST, SMTP_PORT, SMTP_FROM, and optional SMTP_USER / SMTP_PASS.
            Authenticator MFA requires DATA_ENCRYPTION_KEY.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-[var(--muted-foreground)]">
          Host-only recovery: <code className="font-mono text-xs">node scripts/admin-recover.js</code> (interactive password).
        </CardContent>
      </Card>
    </div>
  );
}
