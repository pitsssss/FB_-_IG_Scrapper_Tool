import { cn } from "@/lib/utils/cn";

const tones = {
  unknown: "bg-[var(--muted-foreground)]",
  ok: "bg-[var(--success)]",
  warn: "bg-[var(--warning)]",
  error: "bg-[var(--danger)]",
  idle: "bg-[var(--border)]",
} as const;

export function StatusIndicator({
  tone = "unknown",
  label,
  detail,
  className,
}: {
  tone?: keyof typeof tones;
  label: string;
  detail?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3", className)}>
      <span
        className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", tones[tone])}
        aria-hidden
      />
      <div>
        <p className="text-sm font-medium text-[var(--foreground)]">{label}</p>
        {detail ? <p className="text-xs text-[var(--muted-foreground)]">{detail}</p> : null}
      </div>
    </div>
  );
}
