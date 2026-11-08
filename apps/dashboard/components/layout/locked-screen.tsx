import { ShieldOff } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function LockedScreen({ reason }: { reason: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)] px-4 py-10 text-[var(--foreground)]">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-[var(--danger-muted)] text-[var(--danger)]">
            <ShieldOff className="h-5 w-5" aria-hidden />
          </div>
          <CardTitle>Dashboard unavailable</CardTitle>
          <CardDescription>
            This unsigned preview is locked. The running dashboard uses an admin sign-in session.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-[var(--muted-foreground)]">
          <p>{reason}</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>No unauthenticated admin surface in production builds</li>
            <li>No API keys, Apify tokens, or live scrapes from this UI</li>
            <li>Local preview requires development mode and DASHBOARD_DEV_PREVIEW=1</li>
          </ul>
          <p className="rounded-md border border-[var(--border)] bg-[var(--muted)] px-3 py-2 font-mono text-xs text-[var(--foreground)]">
            cd apps/dashboard && set DASHBOARD_DEV_PREVIEW=1 && npm run dev
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
