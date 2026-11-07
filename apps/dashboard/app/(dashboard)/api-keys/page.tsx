import { PageHeader } from "@/components/layout/page-header";
import { ApiKeysManager } from "@/features/api-keys/api-keys-manager";

export const metadata = { title: "API Keys" };
export const dynamic = "force-dynamic";

export default function ApiKeysPage() {
  return (
    <div>
      <PageHeader
        title="API Keys"
        description="Create integration keys with platform-isolated Facebook and Instagram scopes. Secrets are shown once."
      />
      <ApiKeysManager />
    </div>
  );
}
