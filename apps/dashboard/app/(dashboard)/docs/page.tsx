import { PageHeader } from "@/components/layout/page-header";
import { EndpointDocs } from "@/features/docs/endpoint-docs";

export const metadata = { title: "API Documentation" };

export default function DocsPage() {
  return (
    <div>
      <PageHeader
        title="API Documentation"
        description="Verified public endpoints. Both social routes accept a bare username in the page query parameter."
        showPhase={false}
      />
      <EndpointDocs />
    </div>
  );
}
