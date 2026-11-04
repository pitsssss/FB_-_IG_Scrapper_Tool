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
          <strong className="font-medium">Local development preview only.</strong>{" "}
          No admin authentication, secrets storage, or paid scraping. Not safe for public deployment.
          Phase 7C adds real security.
        </p>
      </div>
    </div>
  );
}
