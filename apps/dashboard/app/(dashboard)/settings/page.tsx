import { PageHeader } from "@/components/layout/page-header";
import { AccountSecurityPanel, type SecurityStatus } from "@/features/auth/account-security-panel";
import { AppSettingsPanel, type SettingsSnapshot } from "@/features/settings/app-settings-panel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { adminApiFetch } from "@/lib/auth/api";
import { readSessionToken } from "@/lib/auth/cookies";
import { requireAdmin } from "@/lib/auth/session";
import { fetchSettings } from "@/lib/auth/management";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireAdmin();
  const token = await readSessionToken();
  let initialStatus: SecurityStatus | null = null;
  let initialSettings: SettingsSnapshot | null = null;
  if (token) {
    const [security, settings] = await Promise.all([
      adminApiFetch<SecurityStatus>("/api/v1/admin/security", {
        method: "GET",
        sessionToken: token,
      }),
      fetchSettings(),
    ]);
    if (security.ok && security.body.data) initialStatus = security.body.data;
    if (settings.ok && settings.body.data) {
      initialSettings = settings.body.data as SettingsSnapshot;
    }
  }

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Application configuration, allowlists, warming, and administrator security."
      />
      <div className="mb-10">
        <h2 className="mb-4 text-lg font-semibold">Application</h2>
        <AppSettingsPanel initial={initialSettings} />
      </div>
      <div className="mb-10">
        <h2 className="mb-4 text-lg font-semibold">Administrator security</h2>
        <AccountSecurityPanel initialStatus={initialStatus} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Host-only controls</CardTitle>
          <CardDescription>
            PORT, HOST, CACHE_DIR, MANAGEMENT_DIR, TLS, DATA_ENCRYPTION_KEY, ADMIN_INTERNAL_SECRET, Actor IDs, and SMTP
            remain operator-controlled via environment. Manual quota reset is intentionally unavailable.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-[var(--muted-foreground)]">
          Host recovery: <code className="font-mono text-xs">node scripts/admin-recover.js</code>
        </CardContent>
      </Card>
    </div>
  );
}
