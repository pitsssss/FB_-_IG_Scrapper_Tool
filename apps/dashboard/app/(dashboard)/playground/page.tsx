import { PageHeader } from "@/components/layout/page-header";
import { PlaygroundApp } from "@/features/playground/playground-app";
import { requireAdmin } from "@/lib/auth/session";

export const metadata = { title: "API Playground" };
export const dynamic = "force-dynamic";

export default async function PlaygroundPage() {
  await requireAdmin();
  const maxPosts = Number.parseInt(process.env.MAX_POSTS || "10", 10);
  const bound = Number.isFinite(maxPosts) && maxPosts > 0 ? Math.min(maxPosts, 50) : 10;

  return (
    <div>
      <PageHeader
        title="API Playground"
        description="Inspect cached Facebook/Instagram posts or confirm a live refresh through the management API. Cache Only never contacts providers."
      />
      <PlaygroundApp maxPosts={bound} />
    </div>
  );
}
