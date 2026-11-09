import Link from "next/link";
import { MobileBrandLink, MobileNav } from "@/components/layout/mobile-nav";
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
    <div className="min-h-dvh bg-[var(--background)] text-[var(--foreground)]">
      <div className="flex min-h-dvh w-full">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col overflow-y-auto border-r border-[var(--border)] bg-[var(--surface)] xl:flex">
          <div className="flex h-14 shrink-0 items-center border-b border-[var(--border)] px-4">
            <Link href="/overview" className="text-sm font-semibold tracking-tight">
              Social Media Posts API
            </Link>
          </div>
          <SidebarNav dense />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--background)]/90 backdrop-blur supports-[backdrop-filter]:bg-[var(--background)]/75">
            <div className="flex min-h-14 items-center gap-2 px-3 py-2 sm:px-4">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <MobileNav adminUsername={adminUsername} />
                <MobileBrandLink />
              </div>
              <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                {adminUsername ? (
                  <span className="hidden max-w-[14rem] truncate text-xs text-[var(--muted-foreground)] xl:inline">
                    Signed in as {adminUsername}
                  </span>
                ) : null}
                <div className="hidden xl:block">
                  <LogoutButton />
                </div>
                <ThemeToggle />
              </div>
            </div>
          </header>
          <main className="min-w-0 flex-1 px-3 py-5 sm:px-5 sm:py-6 xl:px-8">
            <div className="mx-auto w-full max-w-[110rem]">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
