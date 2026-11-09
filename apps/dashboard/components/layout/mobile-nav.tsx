"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { LogoutButton } from "@/features/auth/logout-button";

const emptySubscribe = () => () => {};

export function MobileNav({ adminUsername }: { adminUsername?: string }) {
  const [open, setOpen] = useState(false);
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        triggerRef.current?.focus();
      }
      return;
    }

    wasOpenRef.current = true;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusClose = () => closeRef.current?.focus();
    const frame = window.requestAnimationFrame(focusClose);

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const onResize = () => {
      if (window.matchMedia("(min-width: 1280px)").matches) {
        setOpen(false);
      }
    };

    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function closeDrawer() {
    setOpen(false);
  }

  const drawer =
    open && mounted
      ? createPortal(
          <div
            className="fixed inset-0 z-[100] xl:hidden"
            id="mobile-nav-drawer"
            data-mobile-nav-root="true"
          >
            <button
              type="button"
              className="absolute inset-0 bg-black/45"
              aria-label="Close navigation overlay"
              data-mobile-nav-backdrop="true"
              onClick={closeDrawer}
            />
            <div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              data-mobile-nav-panel="true"
              className="absolute inset-y-0 left-0 flex h-[100dvh] min-h-full w-[min(20rem,calc(100vw-2rem))] max-w-full flex-col border-r border-[var(--border)] bg-[var(--surface)] pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] shadow-xl"
            >
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
                <div className="min-w-0">
                  <p id={titleId} className="truncate text-sm font-semibold text-[var(--foreground)]">
                    Social Media Posts API
                  </p>
                  <p className="text-xs text-[var(--muted-foreground)]">Navigation</p>
                </div>
                <Button
                  ref={closeRef}
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Close navigation"
                  onClick={closeDrawer}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <SidebarNav onNavigate={closeDrawer} />
              </div>

              <div className="shrink-0 space-y-3 border-t border-[var(--border)] px-4 py-4">
                {adminUsername ? (
                  <p className="truncate text-xs text-[var(--muted-foreground)]">
                    Signed in as {adminUsername}
                  </p>
                ) : null}
                <LogoutButton />
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="icon"
        className="xl:hidden"
        aria-expanded={open}
        aria-controls="mobile-nav-drawer"
        aria-haspopup="dialog"
        aria-label="Open navigation"
        onClick={() => setOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>
      {drawer}
    </>
  );
}

export function MobileBrandLink() {
  return (
    <Link href="/overview" className="truncate text-sm font-semibold tracking-tight xl:hidden">
      Posts API
    </Link>
  );
}
