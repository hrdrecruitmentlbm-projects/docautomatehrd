"use client"; // Error boundaries must be Client Components

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Copy, Check, ChevronDown } from "lucide-react";

/**
 * Route error boundary. Next 16 passes `unstable_retry` (not `reset`)
 * to re-fetch and re-render the segment.
 *
 * This exists so a failed Supabase query reads as an ERROR with recovery,
 * never as an empty state ("Belum ada dokumen") — error and empty are
 * distinct states with distinct recovery paths.
 *
 * DETAIL ERRORNYA DITAMPILKAN (disembunyikan di balik <details>).
 * Tanpa itu, satu-satunya petunjuk adalah "Data tidak dapat dimuat" —
 * dan mustahil membedakan "Supabase env belum di-set" dari "koneksi putus"
 * tanpa masuk ke Vercel logs. Teks error + digest adalah difference antara
 * bug yang bisa diperbaiki dalam 5 menit dan yang harus ditebak.
 */
export default function AppError({ error, unstable_retry }) {
  const [showDetail, setShowDetail] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    console.error("Route error:", error);
  }, [error]);

  const message = error?.message || "(tanpa pesan)";
  const digest = error?.digest;
  const detail = [message, digest ? `digest: ${digest}` : null]
    .filter(Boolean)
    .join("\n");

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(detail);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard tidak tersedia — tidak kritikal */
    }
  };

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

      <div className="mt-6 border-t border-border pt-4 text-left">
        <button
          type="button"
          onClick={() => setShowDetail((v) => !v)}
          aria-expanded={showDetail}
          className="flex items-center gap-1.5 text-xs font-medium text-text-2 transition-colors hover:text-text-1"
        >
          <ChevronDown
            className={`size-3.5 transition-transform ${showDetail ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
          Detail teknis
        </button>

        {showDetail && (
          <div className="mt-2.5 space-y-2">
            <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-surface-2 p-3 font-mono text-xs text-text-1">
              {detail}
            </pre>
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-text-1 transition-colors hover:bg-surface-2"
            >
              {copied ? (
                <Check className="size-3.5 text-primary" aria-hidden="true" />
              ) : (
                <Copy className="size-3.5" aria-hidden="true" />
              )}
              {copied ? "Tersalin" : "Salin detail"}
            </button>
            <p className="text-xs text-text-2">
              Detail ini juga ada di Vercel → Deployment → Functions → Logs.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
