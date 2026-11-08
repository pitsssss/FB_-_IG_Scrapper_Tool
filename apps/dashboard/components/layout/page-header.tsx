import { PhaseBadge } from "@/components/shared/phase-badge";

export function PageHeader({
  title,
  description,
  showPhase = true,
  actions,
}: {
  title: string;
  description?: string;
  showPhase?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 border-b border-[var(--border)] pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[clamp(1.35rem,1.1rem+1vw,1.75rem)] font-semibold tracking-tight text-[var(--foreground)]">
            {title}
          </h1>
          {showPhase ? <PhaseBadge /> : null}
        </div>
        {description ? (
          <p className="max-w-3xl text-sm leading-relaxed text-[var(--muted-foreground)]">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
