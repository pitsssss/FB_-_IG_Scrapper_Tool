import Link from "next/link";
import { PreviewBanner } from "@/components/layout/preview-banner";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <PreviewBanner />
      <header className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
        <Link href="/overview" className="text-sm font-semibold">
          Social Media Posts API
        </Link>
        <ThemeToggle />
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}
