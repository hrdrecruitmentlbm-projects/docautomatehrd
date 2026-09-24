"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FilePlus,
  Database,
  History,
  Settings,
  X,
} from "lucide-react";

/**
 * Nav groups (locked labels: EN nav / ID pages).
 * match lets /generate/[type] light up "Documents" (child flow of
 * Documents, not its own destination).
 */
const NAV_GROUPS = [
  {
    label: "Menu",
    items: [
      { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard", match: ["/dashboard"] },
      { href: "/input-dokumen", icon: FilePlus, label: "Documents", match: ["/input-dokumen", "/generate"] },
      { href: "/data", icon: Database, label: "Data Karyawan", match: ["/data"] },
      { href: "/history", icon: History, label: "Activity", match: ["/history"] },
    ],
  },
  {
    label: "General",
    items: [
      { href: "/settings", icon: Settings, label: "Settings", match: ["/settings"] },
    ],
  },
];

function SidebarContent({ onNavigate, onClose }) {
  const pathname = usePathname();

  const isActive = (match) =>
    match.some((m) =>
      m === "/dashboard" ? pathname === m : pathname.startsWith(m)
    );

  return (
    <div className="flex h-full flex-col">
      {/* Logo row */}
      <div className="flex h-12 shrink-0 items-center gap-2.5 px-3">
        <span
          className="flex size-7 items-center justify-center rounded-md bg-primary text-white"
          aria-hidden="true"
        >
          <FilePlus className="size-4" />
        </span>
        <span className="text-[15px] font-semibold tracking-[-0.01em] text-text-1">
          DocAuto HR
        </span>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex size-9 items-center justify-center rounded-md text-text-2 hover:bg-surface-2 hover:text-text-1 lg:hidden"
            aria-label="Tutup navigasi"
          >
            <X className="size-5" />
          </button>
        )}
      </div>

      {/* Nav groups */}
      <nav aria-label="Main" className="flex-1 space-y-5 overflow-y-auto px-3 py-3">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="mb-1 px-3 text-xs font-medium text-text-2">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.match);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      // Drawer needs 44px touch targets; desktop rail uses 36px
                      "flex min-h-11 items-center gap-2.5 rounded-md px-3 text-sm font-medium transition-colors lg:min-h-9",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-text-2 hover:bg-surface-2 hover:text-text-1"
                    )}
                  >
                    <item.icon
                      className={cn(
                        "size-4 shrink-0",
                        active ? "text-primary" : "text-text-2"
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom card slot intentionally renders nothing (locked decision).
          Log Out lives in the top-bar avatar menu only. */}
      <div className="mt-auto" />
    </div>
  );
}

/**
 * Static sidebar, >= lg (a plain nav landmark, never a dialog).
 * No avatar block: it moved to the top bar's avatar menu.
 */
export function Sidebar() {
  return (
    <aside
      id="app-sidebar"
      className="sticky top-0 hidden h-dvh w-[240px] shrink-0 overflow-y-auto border-r border-border bg-surface-1 lg:block"
    >
      <SidebarContent />
    </aside>
  );
}

/**
 * Drawer variant below lg.
 * Focus trap + Escape + scroll lock + focus restore live in the shell
 * (AppShell.jsx), which owns the drawer state machine.
 */
export function SidebarDrawer({ open, onClose, panelRef }) {
  return (
    <div className={cn("lg:hidden", open ? "" : "pointer-events-none")} aria-hidden={!open}>
      {/* Scrim: 45% black (within the 40-60% legibility rule) */}
      <div
        onClick={onClose}
        className={cn(
          "fixed inset-0 z-(--z-scrim) bg-black/45 transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0"
        )}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navigasi"
        tabIndex={-1}
        className={cn(
          "fixed inset-y-0 left-0 z-(--z-drawer) w-[280px] max-w-[85vw] overflow-y-auto bg-surface-1 shadow-dialog",
          open ? "drawer-enter translate-x-0" : "drawer-exit -translate-x-full"
        )}
      >
        <SidebarContent onNavigate={onClose} onClose={onClose} />
      </div>
    </div>
  );
}
