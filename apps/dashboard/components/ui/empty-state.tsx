import { cn } from "@/lib/utils/cn";

export function EmptyState({
  icon,
  title,
  description,
  className,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-12 text-center",
        className,
      )}
    >
      {icon ? <div className="mb-3 text-[var(--muted-foreground)]">{icon}</div> : null}
      <h3 className="text-sm font-semibold text-[var(--foreground)]">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-md text-sm text-[var(--muted-foreground)]">{description}</p>
      ) : null}
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
