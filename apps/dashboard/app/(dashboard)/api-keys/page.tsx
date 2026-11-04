import { Database, KeyRound, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { UnavailableNotice } from "@/components/shared/unavailable-notice";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "API Keys" };

export default function ApiKeysPage() {
  return (
    <div>
      <PageHeader
        title="API Keys"
        description="Create, scope, rotate, and revoke integration keys. Mutations require Phase 7C management storage."
        actions={
          <Button type="button" disabled title="Not available until Phase 7C">
            <Plus className="h-4 w-4" />
            Create key
          </Button>
        }
      />
      <div className="mb-6">
        <UnavailableNotice>
          No plaintext secrets are shown or stored here. Existing env-based API_KEYS remain on the Node API until migration.
        </UnavailableNotice>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Active keys</CardTitle>
          <CardDescription>Name, scopes, created time, last used — never the raw secret.</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={<KeyRound className="h-8 w-8" />}
            title="No keys to display"
            description="Key listing arrives with the authenticated management API. Revoke and rotate actions stay disabled."
          >
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" variant="outline" disabled>
                Rotate
              </Button>
              <Button type="button" variant="outline" disabled>
                Revoke
              </Button>
            </div>
          </EmptyState>
        </CardContent>
      </Card>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Scope model</CardTitle>
          <CardDescription>Platform-isolated cache keys</CardDescription>
        </CardHeader>
        <CardContent className="flex items-start gap-3 text-sm text-[var(--muted-foreground)]">
          <Database className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>
            Facebook usernames map to keys like <code className="font-mono text-xs">cern</code>. Instagram uses{" "}
            <code className="font-mono text-xs">instagram:nasa</code>. Identical bare names stay isolated across platforms.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
