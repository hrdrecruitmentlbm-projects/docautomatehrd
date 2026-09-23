"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Sidebar, SidebarDrawer } from "@/components/Sidebar";
import { TopBar } from "@/components/AppShell/TopBar";

/**
 * Client shell owning the responsive drawer state machine:
 * - focus trap while open, Escape closes, focus restores to the hamburger
 * - scroll lock via .scroll-locked on this root (the shell is the only
 *   scroll context owner's parent — locking <body> alone would not suffice
 *   if main scrolled internally)
 * - close-on-navigate (covers links AND browser back/forward)
 * - force-close when resizing to >= lg (trapped dialog state must not leak
 *   into desktop mode)
 */
export function AppShell({ user, children }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const panelRef = React.useRef(null);
  const hamburgerRef = React.useRef(null);
  const wasOpenRef = React.useRef(false);

  const closeDrawer = React.useCallback(() => setDrawerOpen(false), []);

  // Close on navigate: adjust state during render (React's endorsed pattern
  // for responding to prop changes — covers links AND browser back/forward).
  const [prevPathname, setPrevPathname] = React.useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    if (drawerOpen) setDrawerOpen(false);
  }

  // Force-close at >= lg.
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = (e) => {
      if (e.matches) setDrawerOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Scroll lock + focus management while open.
  React.useEffect(() => {
    if (drawerOpen) {
      document.documentElement.classList.add("scroll-locked");
      wasOpenRef.current = true;
      // Move focus into the dialog.
      const first = panelRef.current?.querySelector(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      (first || panelRef.current)?.focus();
    } else if (wasOpenRef.current) {
      document.documentElement.classList.remove("scroll-locked");
      wasOpenRef.current = false;
      // Restore focus to the trigger.
      hamburgerRef.current?.focus();
    }
    return () => document.documentElement.classList.remove("scroll-locked");
  }, [drawerOpen]);

  // Escape closes; focus trap cycles within the panel.
  React.useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setDrawerOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = panel.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  return (
    <div className="flex min-h-dvh w-full bg-surface-0">
      <a href="#main" className="skip-link">
        Skip to content
      </a>

      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          user={user}
          onOpenDrawer={() => setDrawerOpen(true)}
          hamburgerRef={hamburgerRef}
        />
        {/* Page-level scroll: sticky top bar sticks to the viewport, and the
            drawer/palette lock <html> via .scroll-locked (single mechanism) */}
        <main id="main" tabIndex={-1} className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[1360px] px-4 py-6 sm:px-6">
            {children}
          </div>
        </main>
      </div>

      <SidebarDrawer open={drawerOpen} onClose={closeDrawer} panelRef={panelRef} />
    </div>
  );
}
