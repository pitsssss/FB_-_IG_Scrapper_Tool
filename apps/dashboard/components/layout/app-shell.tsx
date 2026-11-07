import Link from "next/link";
import { MobileNav } from "@/components/layout/mobile-nav";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { LogoutButton } from "@/features/auth/logout-button";

export function AppShell({
  children,
  adminUsername,
}: {
  children: React.ReactNode;
  adminUsername?: string;
}) {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto flex min-h-screen max-w-[90rem]">
        <aside className="sticky top-0 hidden h-screen w-72 shrink-0 border-r border-[var(--border)] bg-[var(--surface)] lg:block">
          <div className="flex h-14 items-center border-b border-[var(--border)] px-4">
            <Link href="/overview" className="text-sm font-semibold tracking-tight">
              Social Media Posts API
            </Link>
          </div>
          <SidebarNav />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--background)]/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-[var(--background)]/75">
            <div className="flex items-center gap-2">
              <MobileNav />
              <Link href="/overview" className="text-sm font-semibold lg:hidden">
                Social Media Posts API
              </Link>
            </div>
            <div className="flex items-center gap-2">
              {adminUsername ? (
                <span className="hidden text-xs text-[var(--muted-foreground)] sm:inline">
                  Signed in as {adminUsername}
                </span>
              ) : null}
              <LogoutButton />
              <ThemeToggle />
            </div>
          </header>
          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-5xl">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
