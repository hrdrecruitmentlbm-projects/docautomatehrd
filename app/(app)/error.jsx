"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

/**
 * Route error boundary. Next 16 passes `unstable_retry` (not `reset`)
 * to re-fetch and re-render the segment.
 *
 * This exists so a failed Supabase query reads as an ERROR with recovery,
 * never as an empty state ("Belum ada dokumen") — error and empty are
 * distinct states with distinct recovery paths.
 */
export default function AppError({ error, unstable_retry }) {
  useEffect(() => {
    console.error("Route error:", error);
  }, [error]);

  return (
    <div className="rounded-lg border border-border bg-surface-1 p-10 text-center">
      <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-red-50">
        <AlertTriangle className="size-6 text-red-600" aria-hidden="true" />
      </div>
      <h2 className="mb-1 text-[15px] font-semibold text-text-1">
        Terjadi kesalahan
      </h2>
      <p className="mx-auto mb-5 max-w-sm text-sm text-text-2">
        Data tidak dapat dimuat. Periksa koneksi Anda lalu coba lagi.
      </p>
      <button
        type="button"
        onClick={() => unstable_retry()}
        className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:translate-y-px"
      >
        <RefreshCw className="size-4" aria-hidden="true" />
        Coba lagi
      </button>
    </div>
  );
}
