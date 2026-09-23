"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, FileText, ExternalLink, Loader2, FolderOpen } from "lucide-react";
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

const TYPE_COLORS = {
  pkwt: "bg-blue-100 text-blue-700",
  sk: "bg-emerald-100 text-emerald-700",
  memo: "bg-amber-100 text-amber-700",
  sp: "bg-red-100 text-red-700",
};

const RECENT_KEY = "docauto-search-recent";

function readRecent() {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(raw) ? raw.slice(0, 5) : [];
  } catch {
    return [];
  }
}

function pushRecent(q) {
  try {
    const next = [q, ...readRecent().filter((r) => r !== q)].slice(0, 5);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — recent queries are a nicety, not a requirement */
  }
}

/**
 * Global search palette over document_logs.
 * States: idle (field hints + recent queries) / loading (3 skeleton rows) /
 * empty / error (inline retry) / results.
 * Keyboard: Cmd/Ctrl+K toggles, Esc closes (focus restores via Dialog),
 * arrow keys + Enter handled by cmdk, aria-live announces result count.
 */
export function SearchPalette({ open, onOpenChange }) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [recent, setRecent] = React.useState([]);
  const abortRef = React.useRef(null);
  const timerRef = React.useRef(null);

  const runSearch = React.useCallback(async (q) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=20`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      const json = await res.json();
      setResults(json.results || []);
    } catch (err) {
      if (err.name === "AbortError") return;
      setError(err.message || "Pencarian gagal");
      setResults([]);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  // Input handler owns the sub-2-char state reset (event-driven, not an
  // effect); the effect below only schedules the debounce timer.
  const handleQueryChange = (value) => {
    setQuery(value);
    if (value.trim().length < 2) {
      abortRef.current?.abort();
      clearTimeout(timerRef.current);
      setLoading(false);
      setResults([]);
      setError(null);
    }
  };

  // 250ms debounce. State resets live in handleQueryChange; this effect
  // only schedules/cancels the timer (no synchronous setState).
  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => runSearch(q), 250);
    return () => clearTimeout(timerRef.current);
  }, [query, runSearch]);

  const handleOpenChange = (next) => {
    if (next) {
      // localStorage read happens here (user event), not in an effect.
      setRecent(readRecent());
    } else {
      abortRef.current?.abort();
      clearTimeout(timerRef.current);
      setLoading(false);
      setQuery("");
      setResults([]);
      setError(null);
    }
    onOpenChange?.(next);
  };

  const openResult = (log) => {
    const q = query.trim();
    if (q.length >= 2) pushRecent(q);
    if (log.google_doc_url) {
      window.open(log.google_doc_url, "_blank", "noopener,noreferrer");
    }
    handleOpenChange(false);
  };

  const q = query.trim();
  const showSkeleton = loading && q.length >= 2 && results.length === 0;

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Cari dokumen"
      description="Cari nama karyawan, jenis dokumen, atau email pembuat."
      // Full-width top sheet on small screens, centered dialog on desktop.
      className="top-[12%] translate-y-0 sm:top-1/3 sm:w-auto sm:max-w-lg"
    >
      {/* shouldFilter=false: results are filtered server-side by /api/search,
          not by cmdk's client-side match. */}
      <Command shouldFilter={false}>
      <CommandInput
        value={query}
        onValueChange={handleQueryChange}
        placeholder="Cari nama karyawan, jenis dokumen, atau email..."
      />

      {/* Result count for screen readers — no focus theft */}
      <p role="status" aria-live="polite" className="sr-only">
        {loading
          ? "Mencari..."
          : error
            ? "Pencarian gagal"
            : `${results.length} hasil`}
      </p>

      <CommandList>
        {showSkeleton ? (
          <div className="p-2 space-y-2" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 h-11 px-2">
                <div className="skeleton size-6 rounded-md shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="skeleton h-3 w-1/2 rounded" />
                  <div className="skeleton h-3 w-1/3 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="py-8 text-center px-4">
            <p className="text-sm text-text-2 mb-3">{error}</p>
            <button
              type="button"
              onClick={() => runSearch(q)}
              className="text-sm font-medium text-blue-700 hover:underline"
            >
              Coba lagi
            </button>
          </div>
        ) : (
          <>
            <CommandEmpty>
              {q.length < 2 ? (
                <div className="px-3 py-2 text-left">
                  <p className="text-sm text-text-2">
                    Cari nama karyawan, jenis dokumen, atau email.
                  </p>
                  {recent.length > 0 && (
                    <div className="mt-4">
                      <p className="text-xs font-medium text-text-2 mb-1.5">
                        Pencarian terakhir
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {recent.map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => setQuery(r)}
                            className="text-xs px-2.5 py-1 rounded-full bg-surface-2 text-text-1 hover:bg-surface-3 transition-colors"
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-4">
                  <p className="text-sm text-text-1 mb-1">
                    Tidak ada hasil untuk &ldquo;{q}&rdquo;
                  </p>
                  <p className="text-xs text-text-2">
                    Periksa ejaan, atau coba nama karyawan lengkap.
                  </p>
                </div>
              )}
            </CommandEmpty>

            {results.length > 0 && (
              <CommandGroup heading="Dokumen">
                {results.map((log) => {
                  const type = (log.document_type || "").toLowerCase();
                  return (
                    <CommandItem
                      key={log.id}
                      value={`${log.employee_name || ""} ${log.document_type || ""} ${log.user_email || ""}`}
                      onSelect={() => openResult(log)}
                      className="h-11 cursor-pointer gap-3 px-2"
                    >
                      <span
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-md",
                          TYPE_COLORS[type] || "bg-surface-3 text-text-2"
                        )}
                        aria-hidden="true"
                      >
                        <FileText className="size-3.5" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-sm font-medium text-text-1 truncate">
                          {log.employee_name || "Dokumen"}
                        </span>
                        <span className="block text-xs text-text-2 truncate">
                          {log.document_type?.toUpperCase()} ·{" "}
                          {new Date(log.created_at).toLocaleDateString("id-ID", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                          {log.user_email ? ` · ${log.user_email}` : ""}
                        </span>
                      </span>
                      <ExternalLink
                        className="size-3.5 shrink-0 text-text-2"
                        aria-hidden="true"
                      />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>

      {/* Empty idle state gets a navigational affordance */}
      {q.length < 2 && results.length === 0 && !loading && (
        <div className="border-t border-border p-2">
          <button
            type="button"
            onClick={() => {
              handleOpenChange(false);
              router.push("/history");
            }}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-text-2 hover:bg-surface-2 hover:text-text-1 transition-colors"
          >
            <FolderOpen className="size-4" />
            Lihat semua riwayat dokumen
          </button>
        </div>
      )}

      {loading && q.length >= 2 && (
        <div className="flex items-center gap-2 border-t border-border px-3 py-2 text-xs text-text-2">
          <Loader2 className="size-3 animate-spin" aria-hidden="true" />
          Mencari dokumen...
        </div>
      )}
      </Command>
    </CommandDialog>
  );
}
