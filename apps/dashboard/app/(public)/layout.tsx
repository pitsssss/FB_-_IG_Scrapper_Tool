import Link from "next/link";
import { PreviewBanner } from "@/components/layout/preview-banner";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <PreviewBanner />
      <header className="mx-auto flex min-h-14 w-full max-w-lg items-center justify-between gap-3 px-4 pt-[env(safe-area-inset-top)]">
        <Link href="/overview" className="text-sm font-semibold">
          Social Media Posts API
        </Link>
        <ThemeToggle />
      </header>
      <main className="mx-auto w-full max-w-lg px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">{children}</main>
    </div>
  );
}
