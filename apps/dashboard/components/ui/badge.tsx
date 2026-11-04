import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[var(--muted)] text-[var(--foreground)]",
        success: "border-transparent bg-[var(--success-muted)] text-[var(--success)]",
        warning: "border-transparent bg-[var(--warning-muted)] text-[var(--warning)]",
        danger: "border-transparent bg-[var(--danger-muted)] text-[var(--danger)]",
        outline: "border-[var(--border)] text-[var(--muted-foreground)]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
