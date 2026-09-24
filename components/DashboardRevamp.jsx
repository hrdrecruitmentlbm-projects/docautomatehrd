"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarDays,
  ExternalLink,
  FileText,
  Inbox,
  Minus,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { DashboardCharts, TYPE_COLORS } from "@/components/DashboardCharts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

/**
 * Dashboard revamp (reference-inspired layout):
 *   in-page header (h1 + subtitle | range & segment filters)
 *   -> 4 detached SOLID KPI cards with delta chips
 *   -> chart row: bucketed bar chart (granularity select) | donut + legend
 *   -> full-width recent-documents table (type filter).
 *
 * Time model: `now` is a prop captured during SSR — the client never reads
 * the wall clock during render (React compiler purity + hydration safety).
 * All windows are computed from that single reference.
 *
 * Fact domains stay non-overlapping (R2/dedup):
 *   - "Total Dokumen" / "Rata² / Hari" / "Pengguna Aktif" -> selected range
 *   - "Dokumen Bulan Ini" -> calendar month, ignores range (anchor metric)
 *   - bar chart owns the time-bucket breakdown; donut owns type composition;
 *     the table owns row-level detail.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const RANGES = [
  { value: "7", label: "7 Hari" },
  { value: "30", label: "30 Hari" },
  { value: "month", label: "Bulan Ini" },
  { value: "lastmonth", label: "Bulan Lalu" },
];

const GRANULARITIES = [
  { value: "day", label: "Harian" },
  { value: "week", label: "Mingguan" },
  { value: "month", label: "Bulanan" },
];

const TYPE_FILTERS = [
  { value: "all", label: "Semua Jenis" },
  { value: "pkwt", label: "PKWT" },
  { value: "sk", label: "SK" },
  { value: "memo", label: "Memo" },
  { value: "sp", label: "SP" },
];

const ALL_TYPES = ["PKWT", "SK", "MEMO", "SP"];

// Badge tiles bound to TYPE (agrees with donut cells + legend dots).
const DOC_TYPE_TILES = {
  pkwt: "bg-emerald-100 text-emerald-700",
  sk: "bg-amber-100 text-amber-700",
  memo: "bg-slate-100 text-slate-700",
  sp: "bg-red-100 text-red-700",
};
const tileFor = (type) =>
  DOC_TYPE_TILES[(type || "").toLowerCase()] || "bg-surface-3 text-text-2";

function startOfDay(time) {
  const d = new Date(time);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Selected window: {from, to, days, label}. Pure — caller supplies now. */
function rangeBounds(range, now) {
  const d = new Date(now);
  if (range === "7" || range === "30") {
    const days = Number(range);
    return {
      from: startOfDay(now) - (days - 1) * DAY_MS,
      to: now,
      days,
      label: `${days} hari terakhir`,
    };
  }
  if (range === "month") {
    const from = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
    return {
      from,
      to: now,
      days: Math.max(1, Math.round((now - from + DAY_MS) / DAY_MS)),
      label: "Bulan ini",
    };
  }
  // lastmonth: full previous calendar month.
  const from = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
  const to = new Date(d.getFullYear(), d.getMonth(), 1).getTime() - 1;
  return {
    from,
    to,
    days: Math.max(1, Math.round((to - from + DAY_MS) / DAY_MS)),
    label: "Bulan lalu",
  };
}

/** Immediately-preceding comparable window (same length / same elapsed). */
function prevBounds(range, now, cur) {
  const d = new Date(now);
  if (range === "7" || range === "30") {
    return { from: cur.from - cur.days * DAY_MS, to: cur.from - 1 };
  }
  if (range === "month") {
    // Month-to-date vs same elapsed time last month (apples to apples).
    const pmFrom = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
    const pmEnd = new Date(d.getFullYear(), d.getMonth(), 1).getTime() - 1;
    return { from: pmFrom, to: Math.min(pmFrom + (cur.to - cur.from), pmEnd) };
  }
  const from = new Date(d.getFullYear(), d.getMonth() - 2, 1).getTime();
  const to = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime() - 1;
  return { from, to };
}

function countBetween(logs, from, to) {
  let n = 0;
  for (const log of logs) {
    const t = new Date(log.created_at).getTime();
    if (!Number.isNaN(t) && t >= from && t <= to) n++;
  }
  return n;
}

function usersBetween(logs, from, to) {
  const set = new Set();
  for (const log of logs) {
    const t = new Date(log.created_at).getTime();
    if (!Number.isNaN(t) && t >= from && t <= to && log.user_email) {
      set.add(log.user_email);
    }
  }
  return set.size;
}

/** Percentage delta vs previous window; guards prev=0. */
function pctDelta(cur, prev) {
  if (prev === 0) {
    return cur > 0
      ? { text: "Baru", dir: 1 }
      : { text: "0%", dir: 0 };
  }
  const pct = Math.round(((cur - prev) / prev) * 100);
  return {
    text: `${pct > 0 ? "+" : ""}${pct}%`,
    dir: pct > 0 ? 1 : pct < 0 ? -1 : 0,
  };
}

const fmtInt = (n) => n.toLocaleString("id-ID");
const fmtDec = (n) =>
  n.toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtDay = (t) =>
  new Date(t).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

function DeltaChip({ delta, context }) {
  const Icon = delta.dir > 0 ? TrendingUp : delta.dir < 0 ? TrendingDown : Minus;
  return (
    <p className="mt-auto flex flex-wrap items-center gap-1.5 pt-4 text-xs font-medium text-white">
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      <span>{delta.text}</span>
      <span className="font-normal">{context}</span>
    </p>
  );
}

function KpiCard({ label, value, delta, context, surface }) {
  return (
    <article
      className={`flex min-h-[132px] flex-col rounded-lg p-5 ${surface}`}
    >
      <p className="text-sm font-medium text-white">{label}</p>
      <p className="mt-3 text-3xl font-semibold leading-none tabular text-white">
        {value}
      </p>
      <DeltaChip delta={delta} context={context} />
    </article>
  );
}

export function DashboardRevamp({ logs, recentCap, now }) {
  // Stable reference: `logs` only changes on navigation, but `logs || []`
  // would otherwise be a fresh array identity each render.
  const allLogs = React.useMemo(() => logs || [], [logs]);
  const [range, setRange] = React.useState("30");
  const [granularity, setGranularity] = React.useState("day");
  const [segment, setSegment] = React.useState("all");
  const [typeFilter, setTypeFilter] = React.useState("all");

  // Segment options come from data (lini_bisnis exists on PKWT-era rows only).
  const segments = React.useMemo(() => {
    const set = new Set();
    for (const log of allLogs) {
      const v = (log.lini_bisnis || "").trim().toUpperCase();
      if (v) set.add(v);
    }
    return [...set].sort();
  }, [allLogs]);

  const inSegment = (log, seg) =>
    seg === "all" || (log.lini_bisnis || "").trim().toUpperCase() === seg;

  const segLogs = allLogs.filter((l) => inSegment(l, segment));

  const bounds = rangeBounds(range, now);
  const prev = prevBounds(range, now, bounds);
  const rangeLogs = segLogs.filter((l) => {
    const t = new Date(l.created_at).getTime();
    return !Number.isNaN(t) && t >= bounds.from && t <= bounds.to;
  });

  // KPI math (domains documented at top of file).
  const curCount = rangeLogs.length;
  const prevCount = countBetween(segLogs, prev.from, prev.to);
  const curAvg = curCount / bounds.days;
  const prevAvg = prevCount / bounds.days;
  const curUsers = usersBetween(segLogs, bounds.from, bounds.to);
  const prevUsers = usersBetween(segLogs, prev.from, prev.to);

  const d = new Date(now);
  const monthFrom = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const pm = prevBounds("month", now, { from: monthFrom, to: now });
  const monthCount = countBetween(segLogs, monthFrom, now);
  const prevMonthCount = countBetween(segLogs, pm.from, pm.to);

  const kpis = [
    {
      label: "Total Dokumen",
      value: fmtInt(curCount),
      delta: pctDelta(curCount, prevCount),
      context: "vs periode sebelumnya",
      surface: "bg-kpi-emerald",
    },
    {
      label: "Dokumen Bulan Ini",
      value: fmtInt(monthCount),
      delta: pctDelta(monthCount, prevMonthCount),
      context: "vs bulan lalu",
      surface: "bg-kpi-gold",
    },
    {
      label: "Rata² / Hari",
      value: fmtDec(curAvg),
      delta: pctDelta(curAvg, prevAvg),
      context: "vs periode sebelumnya",
      surface: "bg-kpi-graphite",
    },
    {
      label: "Pengguna Aktif",
      value: fmtInt(curUsers),
      delta: pctDelta(curUsers, prevUsers),
      context: "vs periode sebelumnya",
      surface: "bg-kpi-signal",
    },
  ];

  const periodLabel = `${fmtDay(bounds.from)} – ${fmtDay(bounds.to)}`;

  const tableLogs = rangeLogs
    .filter(
      (l) =>
        typeFilter === "all" ||
        (l.document_type || "").toLowerCase() === typeFilter
    )
    .slice(0, 10);

  const resetFilters = () => {
    setRange("30");
    setSegment("all");
    setTypeFilter("all");
  };

  const typeCounts = ALL_TYPES.map((name) => ({
    name,
    value: rangeLogs.filter(
      (l) => (l.document_type || "").toUpperCase() === name
    ).length,
  }));
  const compositionTotal = rangeLogs.length;

  return (
    <div className="space-y-5">
      {/* In-page header: page owns the route's single <h1> (headerMode=page) */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold leading-7 tracking-[-0.01em] text-text-1">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-text-2">
            Berikut ringkasan dokumen dan aktivitas Anda.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={range} onValueChange={setRange}>
            <SelectTrigger className="h-9 gap-2" aria-label="Rentang waktu">
              <CalendarDays className="size-4 text-text-2" aria-hidden="true" />
              <span className="text-sm text-text-1">
                {RANGES.find((r) => r.value === range)?.label}
              </span>
            </SelectTrigger>
            <SelectContent>
              {RANGES.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {segments.length > 0 && (
            <Select value={segment} onValueChange={setSegment}>
              <SelectTrigger className="h-9" aria-label="Segment lini bisnis">
                <span className="text-sm text-text-1">
                  {segment === "all" ? "Semua Segment" : segment}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Segment</SelectItem>
                {segments.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </header>

      {/* KPI band: 4 detached SOLID cards (doc-palette mapping, white ink) */}
      <section aria-label="Indikator utama" className="space-y-2">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => (
            <KpiCard key={kpi.label} {...kpi} />
          ))}
        </div>
        {/* Windowed counts must never read as exact totals */}
        <p className="text-right text-xs tabular text-text-2">
          Periode {periodLabel} · Berdasarkan{" "}
          {fmtInt(recentCap)} dokumen terbaru
        </p>
      </section>

      {/* Chart row: bar (wider) | donut + legend + footer action */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section
          aria-labelledby="activity-heading"
          className="rounded-lg border border-border bg-surface-1 p-5"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2
              id="activity-heading"
              className="text-[15px] font-semibold text-text-1"
            >
              Aktivitas Dokumen
            </h2>
            <Select value={granularity} onValueChange={setGranularity}>
              <SelectTrigger
                className="h-8"
                aria-label="Granularity grafik aktivitas"
              >
                <span className="text-sm text-text-1">
                  {GRANULARITIES.find((g) => g.value === granularity)?.label}
                </span>
              </SelectTrigger>
              <SelectContent>
                {GRANULARITIES.map((g) => (
                  <SelectItem key={g.value} value={g.value}>
                    {g.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DashboardCharts
            logs={rangeLogs}
            chartType="bar"
            granularity={granularity}
            bounds={{ from: bounds.from, to: bounds.to }}
            fill="var(--brand-600)"
          />
          <p className="mt-2 text-right text-xs tabular text-text-2">
            Total {fmtInt(curCount)} dokumen pada periode ini
          </p>
        </section>

        <section
          aria-labelledby="composition-heading"
          className="flex flex-col rounded-lg border border-border bg-surface-1 p-5"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2
              id="composition-heading"
              className="text-[15px] font-semibold text-text-1"
            >
              Komposisi Dokumen
            </h2>
            <span className="rounded-md border border-border px-2 py-1 text-xs tabular text-text-2">
              {periodLabel}
            </span>
          </div>

          <div className="flex flex-1 flex-col items-center gap-4 sm:flex-row">
            <div className="w-full sm:w-[46%]">
              <DashboardCharts logs={rangeLogs} chartType="pie" />
            </div>
            {/* Legend: name row + value row, colors bound to TYPE */}
            <ul className="grid w-full flex-1 grid-cols-2 gap-x-4 gap-y-4">
              {typeCounts.map((t) => (
                <li key={t.name}>
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-sm"
                      style={{ background: TYPE_COLORS[t.name] }}
                      aria-hidden="true"
                    />
                    <span className="text-sm text-text-2">{t.name}</span>
                  </div>
                  <p className="mt-1 pl-[18px] text-lg font-semibold tabular text-text-1">
                    {fmtInt(t.value)}
                    {compositionTotal > 0 && (
                      <span className="ml-1.5 text-xs font-normal text-text-2">
                        {Math.round((t.value / compositionTotal) * 100)}%
                      </span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <Link
            href="/history"
            className="mt-4 flex h-9 w-full items-center justify-center rounded-md border border-border text-sm font-medium text-text-1 transition-colors hover:bg-surface-2"
          >
            Lihat Detail
          </Link>
        </section>
      </div>

      {/* Recent documents: full width, type filter, ID-like number column */}
      <section
        aria-labelledby="recent-docs-heading"
        className="overflow-hidden rounded-lg border border-border bg-surface-1"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <h2
            id="recent-docs-heading"
            className="text-[15px] font-semibold text-text-1"
          >
            Dokumen Terbaru
          </h2>
          <div className="flex items-center gap-3">
            <Link
              href="/history"
              className="text-sm font-medium text-primary hover:underline"
            >
              Lihat Semua
            </Link>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-8" aria-label="Filter jenis dokumen">
                <span className="text-sm text-text-1">
                  {TYPE_FILTERS.find((t) => t.value === typeFilter)?.label}
                </span>
              </SelectTrigger>
              <SelectContent>
                {TYPE_FILTERS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {allLogs.length === 0 ? (
          /* Teaching empty state, not "nothing here" */
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-surface-2">
              <Inbox className="size-6 text-text-2" aria-hidden="true" />
            </div>
            <h3 className="mb-1 text-sm font-semibold text-text-1">
              Belum ada dokumen
            </h3>
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
        ) : tableLogs.length === 0 ? (
          /* Filters matched nothing — offer the way out */
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <p className="text-sm text-text-2">
              Tidak ada dokumen pada periode atau filter ini.
            </p>
            <button
              type="button"
              onClick={resetFilters}
              className="mt-4 inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-text-1 transition-colors hover:bg-surface-2"
            >
              Reset filter
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Daftar dokumen terbaru (maksimal 10 baris) beserta nomor,
                jenis, tanggal, dan pembuatnya pada filter yang dipilih.
              </caption>
              <thead>
                <tr className="border-b border-border text-xs font-medium text-text-2">
                  <th scope="col" className="px-5 py-2.5 text-left">Nama</th>
                  <th
                    scope="col"
                    className="hidden px-4 py-2.5 text-left lg:table-cell"
                  >
                    Nomor
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-left">Jenis</th>
                  <th scope="col" className="px-4 py-2.5 text-left">Tanggal</th>
                  <th
                    scope="col"
                    className="hidden px-4 py-2.5 text-left md:table-cell"
                  >
                    Pembuat
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {tableLogs.map((log) => {
                  const type = (log.document_type || "").toLowerCase();
                  return (
                    <tr
                      key={log.id}
                      className="border-b border-row-border transition-colors last:border-b-0 hover:bg-surface-0"
                    >
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex size-7 shrink-0 items-center justify-center rounded-md ${tileFor(type)}`}
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
                              {new Date(log.created_at).toLocaleDateString(
                                "id-ID",
                                {
                                  day: "2-digit",
                                  month: "short",
                                  year: "numeric",
                                }
                              )}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className="hidden max-w-[160px] px-4 py-2.5 lg:table-cell">
                        <span className="block truncate font-mono text-xs text-text-2">
                          {log.document_number || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex h-5 items-center rounded-full px-2 text-xs font-medium ${tileFor(type)}`}
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
    </div>
  );
}
