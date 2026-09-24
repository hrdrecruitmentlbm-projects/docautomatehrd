"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Menu,
  Search,
  Plus,
  Settings,
  LogOut,
  User,
  ChevronDown,
  ArrowLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { resolveRouteMeta } from "@/lib/route-meta";
import { SearchPalette } from "@/components/AppShell/SearchPalette";

/**
 * The app shell's sticky top bar (h-14).
 * Owns: the route's single <h1> when headerMode === "shell", the global
 * search trigger (Cmd/Ctrl+K), the route's primary action, and the single
 * avatar menu (Settings + Log Out) that replaces all per-page user chips.
 */
export function TopBar({ user, onOpenDrawer, hamburgerRef }) {
  const pathname = usePathname();
  const router = useRouter();
  const meta = resolveRouteMeta(pathname);
  const [searchOpen, setSearchOpen] = React.useState(false);

  // Global Cmd/Ctrl+K toggle.
  React.useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const showTitle = meta.headerMode === "shell" && meta.title;
  const initial = user?.name?.charAt(0)?.toUpperCase() || "U";

  return (
    <header
      className="sticky top-0 z-(--z-sticky) flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface-0 px-4 sm:px-6"
    >
      {/* Drawer trigger — below lg only */}
      <button
        ref={hamburgerRef}
        type="button"
        onClick={onOpenDrawer}
        className="flex size-9 shrink-0 items-center justify-center rounded-md text-text-2 hover:bg-surface-2 hover:text-text-1 lg:hidden"
        aria-expanded={false}
        aria-controls="app-sidebar"
        aria-label="Buka navigasi"
      >
        <Menu className="size-5" />
      </button>

      {/* Back link for the /generate child flow */}
      {meta.backHref && (
        <Link
          href={meta.backHref}
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-text-2 hover:bg-surface-2 hover:text-text-1"
          aria-label={`Kembali ke ${meta.backLabel}`}
        >
          <ArrowLeft className="size-4" />
        </Link>
      )}

      {/* Title block — the route's only <h1> when headerMode === "shell" */}
      <div className="min-w-0 flex-1">
        {showTitle ? (
          <>
            <h1 className="truncate text-lg font-semibold leading-6 tracking-[-0.01em] text-text-1">
              {meta.title}
            </h1>
            {meta.subtitle && (
              <p className="hidden truncate text-[13px] leading-5 text-text-2 sm:block">
                {meta.subtitle}
              </p>
            )}
          </>
        ) : (
          <div aria-hidden="true" />
        )}
      </div>

      {/* Search trigger */}
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="hidden h-9 w-72 items-center gap-2 rounded-md border border-border bg-surface-1 px-3 text-sm text-text-2 transition-colors hover:bg-surface-2 md:flex lg:w-80"
        aria-label="Cari dokumen (tekan Control atau Command plus K)"
        aria-haspopup="dialog"
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 truncate text-left">Cari dokumen...</span>
        <kbd className="hidden rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-text-2 lg:inline">
          ⌘K
        </kbd>
      </button>

      {/* Search icon — mobile/tablet */}
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="flex size-9 shrink-0 items-center justify-center rounded-md text-text-2 hover:bg-surface-2 hover:text-text-1 md:hidden"
        aria-label="Cari dokumen"
        aria-haspopup="dialog"
      >
        <Search className="size-5" />
      </button>

      {/* Primary action — one per screen */}
      {meta.primary && (
        <Link
          href={meta.primary.href}
          className="hidden h-9 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:translate-y-px sm:flex"
        >
          <Plus className="size-4" />
          {meta.primary.label}
        </Link>
      )}
      {meta.primary && (
        <Link
          href={meta.primary.href}
          className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 active:translate-y-px sm:hidden"
          aria-label={meta.primary.label}
        >
          <Plus className="size-5" />
        </Link>
      )}

      {/* Avatar menu — the single user chip */}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex h-9 shrink-0 items-center gap-2 rounded-md px-1.5 outline-none hover:bg-surface-2 data-open:bg-surface-2">
          {user?.image ? (
            <img
              src={user.image}
              alt=""
              className="size-7 rounded-full object-cover"
            />
          ) : (
            <span
              className="flex size-7 items-center justify-center rounded-full bg-emerald-100 text-xs font-semibold text-emerald-700"
              aria-hidden="true"
            >
              {initial}
            </span>
          )}
          <span className="hidden max-w-[140px] truncate text-sm font-medium text-text-1 md:block">
            {user?.name || "User"}
          </span>
          <ChevronDown className="hidden size-4 text-text-2 md:block" />
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-56 shadow-popover">
          <DropdownMenuLabel className="truncate text-text-1">
            {user?.name || "User"}
          </DropdownMenuLabel>
          <p className="truncate px-2 pb-2 text-xs text-text-2">
            {user?.email}
          </p>
          <DropdownMenuSeparator />
          {/* base-ui Menu.Item uses onClick (not Radix onSelect) */}
          <DropdownMenuItem onClick={() => router.push("/settings")}>
            <Settings className="size-4" />
            Settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* Destructive action, spatially separated (nav-separation rule) */}
          <DropdownMenuItem
            variant="destructive"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut className="size-4" />
            Log Out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <SearchPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </header>
  );
}
