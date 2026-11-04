import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { LockedScreen } from "@/components/layout/locked-screen";
import { isDashboardDevPreviewEnabled, previewDeniedReason } from "@/lib/config/preview";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Social Media Posts API",
    template: "%s · Social Media Posts API",
  },
  description:
    "Self-hosted developer dashboard foundation (Phase 7B). Not production-ready without Phase 7C authentication.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const preview = isDashboardDevPreviewEnabled();

  return (
    <html lang="en" suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full`}>
      <body className="min-h-full antialiased">
        <ThemeProvider>
          {preview ? children : <LockedScreen reason={previewDeniedReason()} />}
        </ThemeProvider>
      </body>
    </html>
  );
}
