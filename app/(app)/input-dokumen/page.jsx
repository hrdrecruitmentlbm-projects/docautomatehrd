import { supabaseAdmin } from "@/lib/supabase";
import Link from "next/link";
import { FileText, ExternalLink, Inbox, FolderOpen } from "lucide-react";
import { CopyLinkButton } from "@/components/documents/CopyLinkButton";

/**
 * Documents hub: folder strip + Files table.
 * - Scope: GLOBAL (team library), badge says so, unlike History (personal).
 * - Filters are SERVER truth deep-linked via ?type= (shareable, back/forward
 *   safe); folder cells and pills drive the SAME param so there is one state.
 * - Sort via ?sort= (aria-sort on th), pagination via cumulative ?load=
 *   (25/page, hard cap 50 rendered rows per virtualize rule).
 */

const TYPE_META = {
  pkwt: { label: "PKWT", tile: "bg-emerald-100 text-emerald-700", dot: "bg-primary" },
  sk: { label: "SK", tile: "bg-amber-100 text-amber-700", dot: "bg-amber-600" },
  memo: { label: "Memo", tile: "bg-slate-100 text-slate-700", dot: "bg-slate-500" },
  sp: { label: "SP", tile: "bg-red-100 text-red-700", dot: "bg-red-600" },
};

const VALID_TYPES = ["semua", "pkwt", "sk", "memo", "sp"];
const VALID_SORTS = ["tanggal-desc", "tanggal-asc", "nama-asc", "nama-desc"];
const PAGE_SIZE = 25;
const MAX_ROWS = 50; // never render more than this without virtualization
const COLUMNS =
  "id, employee_name, document_type, user_email, created_at, google_doc_url, document_number";

function buildHref({ type, sort, load }) {
  const params = new URLSearchParams();
  if (type && type !== "semua") params.set("type", type);
  if (sort && sort !== "tanggal-desc") params.set("sort", sort);
  if (load && load > 1) params.set("load", String(load));
  const qs = params.toString();
  return qs ? `?${qs}` : "/input-dokumen";
}

export default async function DocumentsHubPage({ searchParams }) {
  const sp = (await searchParams) || {};
  const activeType = VALID_TYPES.includes(sp.type) ? sp.type : "semua";
  const sort = VALID_SORTS.includes(sp.sort) ? sp.sort : "tanggal-desc";
  const load = Math.min(Math.max(parseInt(sp.load, 10) || 1, 1), Math.ceil(MAX_ROWS / PAGE_SIZE));
  const rowCount = Math.min(load * PAGE_SIZE, MAX_ROWS);

  // Exact counts (head queries): folder strip = true inventory numbers,
  // so they need no window label (unlike the dashboard's capped totals).
  const countQueries = ["pkwt", "sk", "memo", "sp"].map((t) =>
    supabaseAdmin
      .from("document_logs")
      .select("id", { count: "exact", head: true })
      .ilike("document_type", t)
  );
  const totalCountQ = supabaseAdmin
    .from("document_logs")
    .select("id", { count: "exact", head: true });

  const listQ = supabaseAdmin
    .from("document_logs")
    .select(COLUMNS, { count: "exact" })
    .order(
      sort.startsWith("nama") ? "employee_name" : "created_at",
      { ascending: sort.endsWith("asc") }
    )
    .order("created_at", { ascending: false })
    .range(0, rowCount - 1);

  if (activeType !== "semua") listQ.ilike("document_type", activeType);

  const [countResults, listResult] = await Promise.all([
    Promise.all([...countQueries, totalCountQ]),
    listQ,
  ]);

  // error != empty: failed queries route to error.jsx
  const firstError = listResult.error || countResults.find((r) => r.error)?.error;
  if (firstError) throw new Error(`Gagal memuat dokumen: ${firstError.message}`);

  const counts = {
    pkwt: countResults[0].count || 0,
    sk: countResults[1].count || 0,
    memo: countResults[2].count || 0,
    sp: countResults[3].count || 0,
  };
  const totalCount = countResults[4].count || 0;

  const rows = listResult.data || [];
  const shownTotal = listResult.count || 0;
  const activeLabel = activeType === "semua" ? null : TYPE_META[activeType].label;

  const sortHref = (nextSort) => buildHref({ type: activeType, sort: nextSort });
  const sortState = (key) =>
    sort.startsWith(key) ? (sort.endsWith("asc") ? "ascending" : "descending") : "none";

  return (
    <div className="space-y-4">
      {/* Folder strip: ONE bordered panel, hairline grid via gap-px on the
          border color. Cell body filters (?type=), "Buat" link creates. */}
      <section aria-label="Folder jenis dokumen" className="overflow-hidden rounded-lg border border-border bg-border">
        <div className="grid grid-cols-1 gap-px sm:grid-cols-2 xl:grid-cols-4">
          {Object.entries(TYPE_META).map(([t, meta]) => {
            const isActive = activeType === t;
            return (
              <div key={t} className="relative flex bg-surface-1">
                <Link
                  href={buildHref({ type: isActive ? "semua" : t, sort })}
                  aria-current={isActive ? "true" : undefined}
                  className={`flex min-h-[76px] flex-1 items-center gap-3 p-4 transition-colors hover:bg-surface-2 ${
                    isActive ? "bg-brand-wash" : ""
                  }`}
                >
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-md ${meta.tile}`}
                    aria-hidden="true"
                  >
                    <FolderOpen className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-sm font-semibold ${isActive ? "text-brand-wash-ink" : "text-text-1"}`}>
                      {meta.label}
                    </span>
                    <span className="block text-xs tabular text-text-2">
                      {counts[t].toLocaleString("id-ID")} dokumen
                    </span>
                  </span>
                </Link>
                <Link
                  href={`/generate/${t}`}
                  className="flex items-center px-4 text-xs font-medium text-primary transition-colors hover:underline"
                  aria-label={`Buat dokumen ${meta.label} baru`}
                >
                  Buat
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* Files table panel */}
      <section aria-labelledby="files-heading" className="overflow-hidden rounded-lg border border-border bg-surface-1">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <h2 id="files-heading" className="text-[15px] font-semibold text-text-1">
              Files
            </h2>
            {/* Scope badge: R1 (global vs personal) must be visible */}
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text-2">
              Semua pengguna
            </span>
          </div>

          {/* Filter pills: same ?type= state as the folder strip */}
          <nav aria-label="Filter jenis dokumen" className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1">
            {[
              { t: "semua", label: "Semua", count: totalCount },
              ...Object.entries(TYPE_META).map(([t, m]) => ({ t, label: m.label, count: counts[t] })),
            ].map((p) => {
              const isActive = activeType === p.t;
              return (
                <Link
                  key={p.t}
                  href={buildHref({ type: p.t, sort })}
                  aria-current={isActive ? "true" : undefined}
                  className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-surface-2 text-text-2 hover:bg-surface-3 hover:text-text-1"
                  }`}
                >
                  {p.label}
                  <span className="tabular opacity-70">{p.count.toLocaleString("id-ID")}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {totalCount === 0 ? (
          /* Teaching empty: no documents exist at all */
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-surface-2">
              <Inbox className="size-6 text-text-2" aria-hidden="true" />
            </div>
            <h3 className="mb-1 text-sm font-semibold text-text-1">Belum ada dokumen</h3>
            <p className="mb-5 max-w-sm text-sm text-text-2">
              Buat dokumen pertama Anda, data karyawan terisi otomatis dari master.
            </p>
            <Link
              href="/generate/pkwt"
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:translate-y-px"
            >
              Buat dokumen pertama
            </Link>
          </div>
        ) : rows.length === 0 ? (
          /* Filtered-to-zero: teach the filter, don't dead-end */
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <p className="mb-1 text-sm font-semibold text-text-1">
              Tidak ada dokumen {activeLabel}
            </p>
            <p className="mb-4 text-sm text-text-2">
              {counts[activeType] === 0
                ? "Jenis ini belum pernah dibuat."
                : "Coba jenis lain atau ubah urutan."}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Link
                href={buildHref({ type: "semua", sort })}
                className="inline-flex h-9 items-center rounded-md border border-border bg-surface-1 px-4 text-sm font-medium text-text-1 transition-colors hover:bg-surface-2"
              >
                Reset filter
              </Link>
              <Link
                href={`/generate/${activeType}`}
                className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Buat {activeLabel}
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Dokumen {activeLabel || "semua jenis"}, urutkan menurut {sort.replace("-", " ")}.
                  Menampilkan {rows.length} dari {shownTotal}.
                </caption>
                <thead>
                  <tr className="border-y border-border text-xs font-medium text-text-2">
                    <th scope="col" className="px-5 py-2.5 text-left">Nama</th>
                    <th scope="col" className="px-4 py-2.5 text-left">Jenis</th>
                    <th scope="col" aria-sort={sortState("tanggal")} className="px-4 py-2.5 text-left">
                      <Link href={sortHref(sort.startsWith("tanggal") && sort.endsWith("desc") ? "tanggal-asc" : "tanggal-desc")} className="inline-flex items-center gap-1 hover:text-text-1">
                        Tanggal
                        {sort.startsWith("tanggal") && (
                          <span aria-hidden="true">{sort.endsWith("asc") ? "↑" : "↓"}</span>
                        )}
                      </Link>
                    </th>
                    <th scope="col" aria-sort={sortState("nama")} className="px-4 py-2.5 text-left">
                      <Link href={sortHref(sort === "nama-asc" ? "nama-desc" : "nama-asc")} className="inline-flex items-center gap-1 hover:text-text-1">
                        Nama
                        {sort.startsWith("nama") && (
                          <span aria-hidden="true">{sort.endsWith("asc") ? "↑" : "↓"}</span>
                        )}
                      </Link>
                    </th>
                    <th scope="col" className="hidden px-4 py-2.5 text-left md:table-cell">Pembuat</th>
                    <th scope="col" className="px-4 py-2.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((log) => {
                    const t = (log.document_type || "").toLowerCase();
                    const meta = TYPE_META[t] || { label: log.document_type, tile: "bg-surface-3 text-text-2" };
                    const dateStr = new Date(log.created_at).toLocaleDateString("id-ID", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    });
                    return (
                      <tr key={log.id} className="border-b border-row-border transition-colors last:border-b-0 hover:bg-surface-0">
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-3">
                            <span className={`flex size-7 shrink-0 items-center justify-center rounded-md ${meta.tile}`} aria-hidden="true">
                              <FileText className="size-4" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-text-1">
                                {log.employee_name || "Dokumen"}
                              </span>
                              {log.document_number && (
                                <span className="block truncate font-mono text-xs text-text-2">
                                  {log.document_number}
                                </span>
                              )}
                              {/* Meta restack below md where columns 3-5 hide */}
                              <span className="block truncate text-xs text-text-2 md:hidden">
                                {log.document_type?.toUpperCase()} · {dateStr}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-flex h-5 items-center rounded-full px-2 text-xs font-medium ${meta.tile}`}>
                            {log.document_type?.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 tabular text-text-2">
                          <time dateTime={log.created_at}>{dateStr}</time>
                        </td>
                        <td className="px-4 py-2.5 text-text-2">
                          <span className="block max-w-[160px] truncate">{log.employee_name || "-"}</span>
                        </td>
                        <td className="hidden max-w-[180px] truncate px-4 py-2.5 text-text-2 md:table-cell">
                          {log.user_email}
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
                Menampilkan {rows.length.toLocaleString("id-ID")} dari {shownTotal.toLocaleString("id-ID")} dokumen
              </p>
              {rows.length < shownTotal && (
                <Link
                  href={buildHref({ type: activeType, sort, load: load + 1 })}
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
