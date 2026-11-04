import { Database } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { UnavailableNotice } from "@/components/shared/unavailable-notice";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Cache" };

export default function CachePage() {
  return (
    <div>
      <PageHeader
        title="Cache"
        description="Inspect cached Facebook and Instagram entries. Destructive actions stay locked until authenticated admin APIs exist."
      />
      <div className="mb-6">
        <UnavailableNotice>No filesystem browsing and no fabricated cache rows in this phase.</UnavailableNotice>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Cached accounts</CardTitle>
          <CardDescription>Platform · username · posts · last fetched · age · fresh/stale</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 hidden overflow-x-auto rounded-md border border-[var(--border)] md:block">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="bg-[var(--muted)] text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-3 py-2 font-medium">Platform</th>
                  <th className="px-3 py-2 font-medium">Username</th>
                  <th className="px-3 py-2 font-medium">Posts</th>
                  <th className="px-3 py-2 font-medium">Last fetched</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-[var(--muted-foreground)]">
                    No cache entries available to the dashboard yet.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="md:hidden">
            <EmptyState
              icon={<Database className="h-8 w-8" />}
              title="No cache entries"
              description="On small screens, entries will appear as cards once the management API is connected."
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
