import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import Link from "next/link";
import { ExternalLink, FileText, Plus } from "lucide-react";
import { CopyLinkButton } from "@/components/documents/CopyLinkButton";

/**
 * History: PERSONAL recency list (eq user_email) — unlike Documents and
 * search, which are global. The scope badge states that (R1: users must
 * never wonder where their document went).
 * No filter pills here by design: filtering is Documents' job; History is
 * "what I did, newest first" (no sort controls either, per contract).
 */

const PAGE_SIZE = 25;
const MAX_ROWS = 50;
const COLUMNS =
  "id, employee_name, document_type, user_email, created_at, google_doc_url, document_number";

const TYPE_TILES = {
  pkwt: "bg-emerald-100 text-emerald-700",
  sk: "bg-amber-100 text-amber-700",
  memo: "bg-slate-100 text-slate-700",
  sp: "bg-red-100 text-red-700",
};

export default async function HistoryPage({ searchParams }) {
  const session = await auth();
  const sp = (await searchParams) || {};
  const load = Math.min(Math.max(parseInt(sp.load, 10) || 1, 1), Math.ceil(MAX_ROWS / PAGE_SIZE));
  const rowCount = Math.min(load * PAGE_SIZE, MAX_ROWS);

  const { data: logs, error, count: shownTotal } = await supabaseAdmin
    .from("document_logs")
    .select(COLUMNS, { count: "exact" })
    .eq("user_email", session?.user?.email)
    .order("created_at", { ascending: false })
    .range(0, rowCount - 1);

  // error != empty: a failed query must route to error.jsx, never render
  // as "Belum ada riwayat".
  if (error) {
    throw new Error(`Gagal memuat riwayat: ${error.message}`);
  }

  const rows = logs || [];
  const total = shownTotal || 0;

  return (
    <div className="space-y-4">
      <section aria-labelledby="history-heading" className="overflow-hidden rounded-lg border border-border bg-surface-1">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <h2 id="history-heading" className="text-[15px] font-semibold text-text-1">
              Dokumen saya
            </h2>
            {/* Scope badge: personal surface, stated not implied (R1) */}
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text-2">
              Dibuat oleh saya
            </span>
          </div>
        </div>

        {rows.length === 0 ? (
          /* Teaching empty with a create CTA (was missing) */
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-surface-2">
              <FileText className="size-6 text-text-2" aria-hidden="true" />
            </div>
            <h3 className="mb-1 text-sm font-semibold text-text-1">Belum ada riwayat</h3>
            <p className="mb-5 max-w-sm text-sm text-text-2">
              Anda belum membuat dokumen. Dokumen yang Anda buat akan muncul di sini.
            </p>
            <Link
              href="/input-dokumen"
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:translate-y-px"
            >
              <Plus className="size-4" aria-hidden="true" />
              Buat dokumen pertama
            </Link>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Dokumen yang Anda buat, terbaru lebih dulu. Menampilkan {rows.length} dari {total}.
                </caption>
                <thead>
                  <tr className="border-y border-border text-xs font-medium text-text-2">
                    <th scope="col" className="px-5 py-2.5 text-left">Tanggal Dibuat</th>
                    <th scope="col" className="px-4 py-2.5 text-left">Jenis</th>
                    <th scope="col" className="px-4 py-2.5 text-left">Nama / Kepada</th>
                    <th scope="col" className="hidden px-4 py-2.5 text-left md:table-cell">
                      Nomor Dokumen
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((log) => {
                    const t = (log.document_type || "").toLowerCase();
                    const tile = TYPE_TILES[t] || "bg-surface-3 text-text-2";
                    return (
                      <tr key={log.id} className="border-b border-row-border transition-colors last:border-b-0 hover:bg-surface-0">
                        <td className="px-5 py-2.5 tabular text-text-2">
                          <time dateTime={log.created_at}>
                            {new Date(log.created_at).toLocaleDateString("id-ID", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </time>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex h-5 items-center rounded-full px-2 text-xs font-medium ${tile}`}>
                            {log.document_type?.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="block max-w-[220px] truncate font-medium text-text-1">
                            {log.employee_name || "Dokumen"}
                          </span>
                          {/* Meta restack below md where Nomor column hides */}
                          {log.document_number && (
                            <span className="block truncate font-mono text-xs text-text-2 md:hidden">
                              {log.document_number}
                            </span>
                          )}
                        </td>
                        <td className="hidden px-4 py-2.5 md:table-cell">
                          <span className="block max-w-[200px] truncate font-mono text-xs text-text-2">
                            {log.document_number || "-"}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <CopyLinkButton url={log.google_doc_url} />
                            <a
                              href={log.google_doc_url}
                              target="_blank"
                              rel="noreferrer"
                              className="relative inline-flex size-9 items-center justify-center rounded-md text-text-2 transition-colors hover:bg-surface-2 hover:text-text-1 after:absolute after:-inset-1 after:content-['']"
                              aria-label={`Buka ${log.employee_name || "dokumen"} di Google Docs`}
                            >
                              <ExternalLink className="size-4" aria-hidden="true" />
                            </a>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3.5">
              <p className="text-xs tabular text-text-2">
                Menampilkan {rows.length.toLocaleString("id-ID")} dari {total.toLocaleString("id-ID")} dokumen
              </p>
              {rows.length < total && (
                <Link
                  href={`?load=${load + 1}`}
                  className="inline-flex h-9 items-center rounded-md border border-border bg-surface-1 px-4 text-sm font-medium text-text-1 transition-colors hover:bg-surface-2"
                >
                  Muat lebih banyak
                </Link>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
