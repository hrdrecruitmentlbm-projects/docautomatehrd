import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { DashboardCharts } from "@/components/DashboardCharts";
import Link from "next/link";
import {
  FileText,
  FileSignature,
  FilePlus,
  Users,
  ExternalLink,
  Inbox,
  CalendarDays,
} from "lucide-react";

const DOC_TYPE_COLORS = {
  pkwt: { tile: "bg-emerald-100 text-emerald-700", bar: "bg-primary" },
  sk: { tile: "bg-amber-100 text-amber-700", bar: "bg-amber-600" },
  memo: { tile: "bg-slate-100 text-slate-700", bar: "bg-slate-600" },
  sp: { tile: "bg-red-100 text-red-700", bar: "bg-red-600" },
};

const DEFAULT_COLORS = { tile: "bg-surface-3 text-text-2", bar: "bg-primary" };

function colorsFor(type) {
  return DOC_TYPE_COLORS[(type || "").toLowerCase()] || DEFAULT_COLORS;
}

/**
 * Temporal stats with NON-OVERLAPPING fact domains (R2/dedup):
 * - monthCount: KPI "Bulan ini" (absolute, calendar-month window)
 * - hariIni: share of the loaded total (bar = pct)
 * - avg30: daily mean over 30 days (no bar — a mean has no share)
 * - count7: headline total for the rail's 7-day bar chart (the chart owns
 *   the daily breakdown, so no stat row repeats it)
 * Module scope: reads the wall clock (the React compiler forbids that
 * during render).
 */
function computeTemporalStats(logs, totalDocs) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const countSince = (days) =>
    logs.filter((l) => now - new Date(l.created_at).getTime() <= days * dayMs).length;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthCount = logs.filter(
    (l) => new Date(l.created_at).getTime() >= monthStart.getTime()
  ).length;

  const hariIni = countSince(1);
  const avg30raw = countSince(30) / 30;

  return {
    monthCount,
    hariIni,
    hariIniPct:
      totalDocs > 0 ? Math.min(100, Math.round((hariIni / totalDocs) * 100)) : 0,
    avg30: avg30raw.toLocaleString("id-ID", {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    }),
    count7: countSince(7),
  };
}

export default async function NewDashboardPage() {
  const session = await auth();

  // Bounded fetch (Phase 1): aggregates computed from a capped recent set,
  // plus the 10 rows the table actually renders. No unbounded select('*').
  const RECENT_CAP = 500;
  const TABLE_ROWS = 10;

  const { data: logs, error: logsError } = await supabaseAdmin
    .from("document_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(RECENT_CAP);

  // Throwing here routes to error.jsx — an error must never read as empty.
  if (logsError) {
    throw new Error(`Gagal memuat dokumen: ${logsError.message}`);
  }

  const allLogs = logs || [];
  const totalDocs = allLogs.length;
  const pkwtCount = allLogs.filter((l) => l.document_type?.toLowerCase() === "pkwt").length;
  const skCount = allLogs.filter((l) => l.document_type?.toLowerCase() === "sk").length;
  const uniqueUsers = new Set(allLogs.map((l) => l.user_email)).size;

  const tableRows = allLogs.slice(0, TABLE_ROWS);

  const typeData = ["pkwt", "sk", "memo", "sp"]
    .map((type) => ({
      name: type.toUpperCase(),
      value: allLogs.filter((l) => l.document_type?.toLowerCase() === type).length,
    }))
    .filter((d) => d.value > 0);

  // Temporal split: month KPI vs rail stats vs rail chart (one home each)
  const temporal = computeTemporalStats(allLogs, totalDocs);

  // KPI band — one bordered strip, 4 cells (no pastel icon tiles,
  // no in-strip CTA: the top bar owns the primary action).
  const kpis = [
    { label: "Total PKWT", value: pkwtCount, icon: FileSignature },
    { label: "Total SK", value: skCount, icon: FilePlus },
    { label: "Bulan ini", value: temporal.monthCount, icon: CalendarDays },
    { label: "Pengguna Aktif", value: uniqueUsers, icon: Users },
  ];

  const recentActivity = allLogs.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* KPI band: ONE bordered strip with internal hairlines (not 4 cards) */}
      <div className="overflow-hidden rounded-lg border border-border bg-surface-1">
        <div className="grid grid-cols-2 md:grid-cols-4">
          {kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="border-border p-5 even:border-l nth-[3]:border-t nth-[4]:border-t nth-[3]:border-l nth-[4]:border-l md:nth-[3]:border-t-0 md:nth-[4]:border-t-0 md:nth-[2]:border-l-0 md:nth-[2]:border-t-0"
            >
              <div className="flex items-center gap-2 text-text-2">
                <kpi.icon className="size-4" aria-hidden="true" />
                <span className="text-sm font-medium">{kpi.label}</span>
              </div>
              <p className="mt-2 text-2xl font-semibold tabular text-text-1">
                {kpi.value.toLocaleString("id-ID")}
              </p>
            </div>
          ))}
        </div>
        {/* Window label: windowed counts must never read as exact totals */}
        <p className="border-t border-border px-5 py-2.5 text-right text-xs tabular text-text-2">
          Berdasarkan {RECENT_CAP.toLocaleString("id-ID")} dokumen terbaru
        </p>
      </div>

      {/* Main table + right rail. Rail is side-by-side ONLY at xl (>=1280):
          below that the table would be starved to ~420px. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Dokumen Terbaru */}
        <section
          aria-labelledby="recent-docs-heading"
          className="rounded-lg border border-border bg-surface-1 overflow-hidden"
        >
          <div className="flex items-center justify-between px-5 py-4">
            <h2 id="recent-docs-heading" className="text-[15px] font-semibold text-text-1">
              Dokumen Terbaru
            </h2>
            <Link
              href="/history"
              className="text-sm font-medium text-primary hover:underline"
            >
              View All
            </Link>
          </div>

          {tableRows.length === 0 ? (
            /* Teaching empty state, not "nothing here" */
            <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
              <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-surface-2">
                <Inbox className="size-6 text-text-2" aria-hidden="true" />
              </div>
              <h3 className="mb-1 text-sm font-semibold text-text-1">Belum ada dokumen</h3>
              <p className="mb-5 text-sm text-text-2">
                Buat dokumen pertama Anda untuk mulai melacak riwayat.
              </p>
              <Link
                href="/input-dokumen"
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 active:translate-y-px"
              >
                Buat dokumen pertama
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Daftar 10 dokumen terbaru beserta jenis, tanggal, dan pembuatnya.
                </caption>
                <thead>
                  <tr className="border-b border-border text-xs font-medium text-text-2">
                    <th scope="col" className="px-5 py-2.5 text-left">Nama</th>
                    <th scope="col" className="px-4 py-2.5 text-left">Jenis</th>
                    <th scope="col" className="px-4 py-2.5 text-left">Tanggal</th>
                    <th scope="col" className="hidden px-4 py-2.5 text-left md:table-cell">
                      Pembuat
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((log) => {
                    const type = (log.document_type || "").toLowerCase();
                    const colors = colorsFor(type);
                    return (
                      <tr
                        key={log.id}
                        className="border-b border-row-border transition-colors last:border-b-0 hover:bg-surface-0"
                      >
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-3">
                            <span
                              className={`flex size-7 shrink-0 items-center justify-center rounded-md ${colors.tile}`}
                              aria-hidden="true"
                            >
                              <FileText className="size-4" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-text-1">
                                {log.employee_name || "Dokumen"}
                              </span>
                              {/* Meta restacks below md where columns 2-4 hide */}
                              <span className="block truncate text-xs text-text-2 md:hidden">
                                {log.document_type?.toUpperCase()} ·{" "}
                                {new Date(log.created_at).toLocaleDateString("id-ID", {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                })}
                              </span>
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span
                            className={`inline-flex h-5 items-center rounded-full px-2 text-xs font-medium ${colors.tile}`}
                          >
                            {log.document_type?.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 tabular text-text-2">
                          <time dateTime={log.created_at}>
                            {new Date(log.created_at).toLocaleDateString("id-ID", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </time>
                        </td>
                        <td className="hidden max-w-[180px] truncate px-4 py-2.5 text-text-2 md:table-cell">
                          {log.user_email}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <a
                            href={log.google_doc_url}
                            target="_blank"
                            rel="noreferrer"
                            className="relative inline-flex size-9 items-center justify-center rounded-md text-text-2 transition-colors hover:bg-surface-2 hover:text-text-1 after:absolute after:-inset-1 after:content-['']"
                            aria-label={`Buka ${log.employee_name || "dokumen"} di Google Docs`}
                          >
                            <ExternalLink className="size-4" aria-hidden="true" />
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Right rail: ONE bordered panel, hairline-divided sections */}
        <aside className="space-y-4 xl:space-y-0">
          <div className="rounded-lg border border-border bg-surface-1">
            {/* 1. Documents Summary (type composition) */}
            <section aria-labelledby="summary-heading" className="border-b border-border p-5">
              <h2 id="summary-heading" className="mb-3 text-[15px] font-semibold text-text-1">
                Documents Summary
              </h2>
              <DashboardCharts logs={allLogs} chartType="pie" />
              <ul className="mt-2 space-y-0.5">
                {typeData.map((d) => {
                  // Legend dot bound to type (agrees with donut cells + badges)
                  const dotColor = {
                    PKWT: "bg-primary",
                    SK: "bg-amber-600",
                    MEMO: "bg-slate-500",
                    SP: "bg-red-600",
                  };
                  const pct = totalDocs > 0 ? Math.round((d.value / totalDocs) * 100) : 0;
                  return (
                    <li key={d.name} className="flex h-8 items-center gap-2">
                      <span
                        className={`size-2 shrink-0 rounded-sm ${dotColor[d.name] || "bg-surface-3"}`}
                        aria-hidden="true"
                      />
                      <span className="flex-1 text-sm font-medium text-text-1">{d.name}</span>
                      <span className="text-sm font-semibold tabular text-text-1">{d.value}</span>
                      <span className="w-10 text-right text-xs tabular text-text-2">
                        {pct}%
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            {/* 2. Quick stats — temporal share + daily mean. No 7-day row:
                the bar chart below OWNS the 7-day breakdown (dedup). */}
            <section aria-labelledby="quick-stats-heading" className="border-b border-border p-5">
              <h2 id="quick-stats-heading" className="mb-3 text-[15px] font-semibold text-text-1">
                Quick Stats
              </h2>
              <p className="mb-3 text-xs tabular text-text-2">
                Dari {totalDocs.toLocaleString("id-ID")} dokumen terbaru
              </p>
              <ul className="space-y-3.5">
                <li>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-2">Hari ini</span>
                    <span className="font-semibold tabular text-text-1">
                      {temporal.hariIni.toLocaleString("id-ID")}
                    </span>
                  </div>
                  {/* Bar is aria-hidden: the number is the truth (color-not-only) */}
                  <div
                    className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-3"
                    aria-hidden="true"
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${temporal.hariIniPct}%` }}
                    />
                  </div>
                </li>
                <li>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-2">Rata-rata per hari (30 hari)</span>
                    <span className="font-semibold tabular text-text-1">
                      {temporal.avg30}
                    </span>
                  </div>
                </li>
              </ul>
            </section>

            {/* 3. Recent activity */}
            <section aria-labelledby="activity-heading" className="p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 id="activity-heading" className="text-[15px] font-semibold text-text-1">
                  Recent Activity
                </h2>
                <Link
                  href="/history"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  View All
                </Link>
              </div>
              {recentActivity.length === 0 ? (
                <p className="py-4 text-center text-sm text-text-2">Belum ada aktivitas</p>
              ) : (
                <ol className="space-y-4">
                  {recentActivity.map((log, i) => (
                    <li key={log.id} className="flex items-start gap-3">
                      <div className="flex flex-col items-center">
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-semibold text-primary">
                          {(log.user_email || "?").charAt(0).toUpperCase()}
                        </span>
                        {i < recentActivity.length - 1 && (
                          <span className="mt-1 w-px flex-1 bg-border" aria-hidden="true" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <a
                          href={log.google_doc_url}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-sm font-medium text-text-1 hover:text-primary"
                        >
                          {log.employee_name || "Dokumen"}
                        </a>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-text-2">
                          <span>{log.user_email?.split("@")[0]}</span>
                          <span aria-hidden="true">·</span>
                          <span className="uppercase">
                            {log.document_type}
                          </span>
                          <time dateTime={log.created_at} className="tabular">
                            {new Date(log.created_at).toLocaleDateString("id-ID", {
                              day: "2-digit",
                              month: "short",
                            })}
                          </time>
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {/* 4. Activity bars — temporal detail for ALL types. Its own
                fact domain: daily counts (the chart owns the 7-day
                breakdown). Fill = primary, never another type's hue. */}
            <section aria-labelledby="rail-chart-heading" className="border-t border-border p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 id="rail-chart-heading" className="text-[15px] font-semibold text-text-1">
                  Aktivitas 7 hari
                </h2>
                <p className="text-xs tabular text-text-2">
                  Total {temporal.count7.toLocaleString("id-ID")}
                </p>
              </div>
              <DashboardCharts
                logs={allLogs}
                chartType="bar"
                fill="var(--brand-600)"
              />
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
}
