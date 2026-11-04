import { PageHeader } from "@/components/layout/page-header";
import { PlaygroundRequestBuilder } from "@/features/playground/request-builder";
import { UnavailableNotice } from "@/components/shared/unavailable-notice";

export const metadata = { title: "API Playground" };

export default function PlaygroundPage() {
  return (
    <div>
      <PageHeader
        title="API Playground"
        description="Build Facebook or Instagram username requests. Send remains disabled until authenticated BFF integration exists."
      />
      <div className="mb-6">
        <UnavailableNotice title="Execution disabled">
          No paid Apify calls, no cache mutations, and no fabricated successful responses in Phase 7B.
        </UnavailableNotice>
      </div>
      <PlaygroundRequestBuilder />
    </div>
  );
}
