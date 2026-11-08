"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DASHBOARD_NAV } from "@/lib/navigation";
import { cn } from "@/lib/utils/cn";

export function SidebarNav({
  onNavigate,
  dense = false,
}: {
  onNavigate?: () => void;
  dense?: boolean;
}) {
  const pathname = usePathname();

  return (
    <nav aria-label="Primary" className="flex flex-col gap-1 p-3">
      {DASHBOARD_NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
              active
                ? "bg-[var(--primary-muted)] text-[var(--foreground)]"
                : "text-[var(--muted-foreground)] hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
            )}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0">
              <span className="block font-medium text-[var(--foreground)]">{item.label}</span>
              {dense ? null : (
                <span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">{item.description}</span>
              )}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
