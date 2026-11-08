import { AlertTriangle } from "lucide-react";

export function PreviewBanner() {
  return (
    <div
      role="status"
      className="border-b border-[var(--warning)]/40 bg-[var(--warning-muted)] px-4 py-2 text-sm text-[var(--foreground)]"
    >
      <div className="mx-auto flex max-w-6xl items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--warning)]" aria-hidden />
        <p>
          <strong className="font-medium">Self-hosted beta.</strong> You run this on your own
          machine and supply your own Apify token. It is not a hosted service and not a production
          guarantee.
        </p>
      </div>
    </div>
  );
}
