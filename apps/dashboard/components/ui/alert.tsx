import { cn } from "@/lib/utils/cn";

export function Alert({
  className,
  variant = "info",
  title,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  variant?: "info" | "warning" | "danger" | "success";
  title?: string;
}) {
  const styles = {
    info: "border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)]",
    warning: "border-[var(--warning)]/30 bg-[var(--warning-muted)] text-[var(--foreground)]",
    danger: "border-[var(--danger)]/30 bg-[var(--danger-muted)] text-[var(--foreground)]",
    success: "border-[var(--success)]/30 bg-[var(--success-muted)] text-[var(--foreground)]",
  }[variant];

  return (
    <div
      role="status"
      className={cn("rounded-lg border px-4 py-3 text-sm", styles, className)}
      {...props}
    >
      {title ? <p className="font-medium">{title}</p> : null}
      {children ? <div className={cn(title && "mt-1", "text-[var(--muted-foreground)]")}>{children}</div> : null}
    </div>
  );
}
