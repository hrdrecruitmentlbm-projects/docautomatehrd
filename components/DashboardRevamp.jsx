"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  ExternalLink,
  FileText,
  FilePlus2,
  Inbox,
  AlertTriangle,
  CalendarClock,
  Clock,
  CheckCircle2,
  Building2,
  Users,
  Search,
  Filter,
  RotateCcw,
  Sparkles,
  Layers,
  ArrowRight,
} from "lucide-react";
import {
  BusinessLineChart,
  MonthlyTrendChart,
  StatusDistributionChart,
  DurationDistributionChart,
} from "@/components/DashboardCharts";
import { DocumentActions } from "@/components/documents/DocumentActions";
import { ContractStateDot } from "@/components/documents/DocumentStatus";
import { toIsoDate, formatIsoId } from "@/lib/contract-lifecycle";
import { docTypeMeta, isContractType } from "@/lib/doc-types";
import { Button } from "@/components/ui/button";

const tileFor = (type) => docTypeMeta(type).tile;
const fmtInt = (n) => Number(n || 0).toLocaleString("id-ID");

function fmtDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function calculateNextStartDate(endIso) {
  if (!endIso) return "";
  try {
    const d = new Date(endIso);
    if (isNaN(d.getTime())) return "";
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function KpiCard({
  label,
  value,
  context,
  href,
  icon: Icon,
  tone = "brand",
  subBadges = null,
  active = false,
  onClick = null,
}) {
  const tones = {
    brand: "bg-kpi-emerald",
    gold: "bg-amber-600 dark:bg-amber-700",
    graphite: "bg-kpi-graphite",
    signal: "bg-rose-600 dark:bg-rose-700",
    blue: "bg-blue-600 dark:bg-blue-700",
  };

  const content = (
    <>
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-medium text-white/95 uppercase tracking-wider">
          <Icon className="size-4 shrink-0 opacity-90" aria-hidden="true" />
          {label}
        </span>
        {active && (
          <span className="inline-flex size-2 rounded-full bg-white animate-pulse" />
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-semibold leading-none tabular text-white tracking-tight">
          {value}
        </span>
      </div>

      {subBadges && <div className="mt-2.5 flex flex-wrap gap-1.5">{subBadges}</div>}

      <span className="mt-auto block pt-3 text-xs font-normal text-white/85">
        {context}
      </span>
    </>
  );

  const className = `flex min-h-[136px] flex-col rounded-lg p-4 transition-all hover:brightness-110 active:translate-y-px ${
    tones[tone] || tones.brand
  } ${active ? "ring-2 ring-white ring-offset-2 ring-offset-surface-0 shadow-lg" : ""}`;

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${className} text-left`}>
        {content}
      </button>
    );
  }

  return (
    <Link href={href || "#"} className={className}>
      {content}
    </Link>
  );
}

export function DashboardRevamp({
  now,
  kpis,
  byCompany,
  trend,
  byStatus,
  byDuration,
  expiringContracts = [],
  recent = [],
  companyOptions = [],
  activeFilters = {},
}) {
  const router = useRouter();
  const pathname = usePathname();

  // Filter input states
  const [searchQuery, setSearchQuery] = React.useState(activeFilters.search || "");
  const [selectedCompany, setSelectedCompany] = React.useState(activeFilters.perusahaan || "");
  const [selectedStatus, setSelectedStatus] = React.useState(activeFilters.status || "");
  const [selectedSource, setSelectedSource] = React.useState(activeFilters.sumber || "");
  const [onlyPerluCek, setOnlyPerluCek] = React.useState(Boolean(activeFilters.perlu_dicek));

  // Sub-filter untuk tabel Segera Berakhir: 30 | 60 | 90 | all
  const [expiringThreshold, setExpiringThreshold] = React.useState("90");

  // Sinkronisasi filter ke URL
  const applyFilters = React.useCallback(
    (overrides = {}) => {
      const q = overrides.search !== undefined ? overrides.search : searchQuery;
      const comp = overrides.perusahaan !== undefined ? overrides.perusahaan : selectedCompany;
      const st = overrides.status !== undefined ? overrides.status : selectedStatus;
      const src = overrides.sumber !== undefined ? overrides.sumber : selectedSource;
      const chk = overrides.perlu_dicek !== undefined ? overrides.perlu_dicek : onlyPerluCek;

      const params = new URLSearchParams();
      if (q && q.trim()) params.set("q", q.trim());
      if (comp && comp !== "semua") params.set("perusahaan", comp);
      if (st && st !== "semua") params.set("status", st);
      if (src && src !== "semua") params.set("sumber", src);
      if (chk) params.set("perlu_dicek", "1");

      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [searchQuery, selectedCompany, selectedStatus, selectedSource, onlyPerluCek, router, pathname]
  );

  const resetAllFilters = () => {
    setSearchQuery("");
    setSelectedCompany("");
    setSelectedStatus("");
    setSelectedSource("");
    setOnlyPerluCek(false);
    router.push(pathname);
  };

  const hasActiveFilters =
    Boolean(searchQuery) ||
    Boolean(selectedCompany) ||
    Boolean(selectedStatus) ||
    Boolean(selectedSource) ||
    onlyPerluCek;

  // Filter tabel Segera Berakhir berdasarkan threshold (30/60/90 hari)
  const visibleExpiring = React.useMemo(() => {
    const maxDays = parseInt(expiringThreshold, 10) || 90;
    return expiringContracts.filter(
      (c) => c.sisa_hari !== null && c.sisa_hari >= 0 && c.sisa_hari <= maxDays
    );
  }, [expiringContracts, expiringThreshold]);

  return (
    <div className="space-y-6">
      {/* Header Halaman */}
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold leading-7 tracking-[-0.01em] text-text-1">
            Dashboard Kontrak &amp; Dokumen
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-text-2">
            Pusat pemantauan masa berlaku PKWT terpadu (Aplikasi &amp; Arsip Google Drive)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/generate/pkwt"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <FilePlus2 className="size-4" />
            Buat PKWT Baru
          </Link>
        </div>
      </header>

      {/* FILTER BAR (Requirement 4) */}
      <section
        aria-label="Filter Kontrak"
        className="rounded-lg border border-border bg-surface-1 p-3.5 sm:p-4 shadow-xs"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center">
            {/* Pencarian Nama / Nomor Surat */}
            <div className="relative min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-text-2" />
              <input
                type="text"
                placeholder="Cari nama / no. surat..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyFilters();
                }}
                className="h-8 w-full rounded-md border border-border bg-surface-0 pl-8 pr-3 text-xs text-text-1 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>

            {/* Filter Perusahaan */}
            <select
              value={selectedCompany}
              onChange={(e) => {
                setSelectedCompany(e.target.value);
                applyFilters({ perusahaan: e.target.value });
              }}
              className="h-8 rounded-md border border-border bg-surface-0 px-2.5 text-xs text-text-1 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Semua Perusahaan</option>
              {companyOptions.map((comp) => (
                <option key={comp} value={comp}>
                  {comp}
                </option>
              ))}
            </select>

            {/* Filter Status Kontrak & Dokumen */}
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                applyFilters({ status: e.target.value });
              }}
              className="h-8 rounded-md border border-border bg-surface-0 px-2.5 text-xs text-text-1 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Semua Status</option>
              <optgroup label="Masa Kontrak">
                <option value="aktif">Aktif</option>
                <option value="segera_30">Segera Berakhir (≤ 30 hari)</option>
                <option value="segera_60">Segera Berakhir (≤ 60 hari)</option>
                <option value="segera_90">Segera Berakhir (≤ 90 hari)</option>
                <option value="kedaluwarsa">Sudah Berakhir (Kedaluwarsa)</option>
                <option value="terbuka">Tanpa Akhir (Terbuka)</option>
              </optgroup>
              <optgroup label="Siklus Dokumen">
                <option value="ditandatangani">Ditandatangani</option>
                <option value="dikirim">Dikirim</option>
                <option value="draft">Draf</option>
                <option value="arsip">Arsip Drive</option>
              </optgroup>
            </select>

            {/* Filter Sumber */}
            <select
              value={selectedSource}
              onChange={(e) => {
                setSelectedSource(e.target.value);
                applyFilters({ sumber: e.target.value });
              }}
              className="h-8 rounded-md border border-border bg-surface-0 px-2.5 text-xs text-text-1 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Semua Sumber</option>
              <option value="aplikasi">Aplikasi ({fmtInt(kpis.aplikasi)})</option>
              <option value="drive">Drive ({fmtInt(kpis.drive)})</option>
            </select>

            {/* Toggle Perlu Dicek */}
            <button
              type="button"
              onClick={() => {
                const nextVal = !onlyPerluCek;
                setOnlyPerluCek(nextVal);
                applyFilters({ perlu_dicek: nextVal });
              }}
              className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors ${
                onlyPerluCek
                  ? "border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-400"
                  : "border-border bg-surface-0 text-text-2 hover:bg-surface-2"
              }`}
            >
              <AlertTriangle className="size-3.5" />
              Perlu Dicek ({fmtInt(kpis.perluDicek)})
            </button>
          </div>

          <div className="flex items-center gap-2 self-end lg:self-auto">
            <Button
              type="button"
              size="sm"
              onClick={() => applyFilters()}
              className="h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Filter className="size-3.5 mr-1" />
              Terapkan
            </Button>
            {hasActiveFilters && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={resetAllFilters}
                className="h-8 text-xs text-text-2"
              >
                <RotateCcw className="size-3.5 mr-1" />
                Reset
              </Button>
            )}
          </div>
        </div>

        {hasActiveFilters && (
          <p className="mt-2 text-[11px] text-text-2">
            Menampilkan data sesuai filter aktif. Total:{" "}
            <span className="font-semibold text-text-1">{fmtInt(kpis.total)}</span> kontrak.
          </p>
        )}
      </section>

      {/* KARTU RINGKASAN / KPI (Requirement 1) */}
      <section aria-label="Ringkasan Utama Kontrak">
        <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {/* 1. Kontrak Aktif */}
          <KpiCard
            label="Kontrak Aktif"
            value={fmtInt(kpis.aktif)}
            context="masa berlaku masih berjalan"
            icon={CheckCircle2}
            tone="brand"
            active={selectedStatus === "aktif"}
            onClick={() => {
              const nextStatus = selectedStatus === "aktif" ? "" : "aktif";
              setSelectedStatus(nextStatus);
              applyFilters({ status: nextStatus });
            }}
          />

          {/* 2. Berakhir dalam 30/60/90 Hari */}
          <KpiCard
            label="Segera Berakhir"
            value={fmtInt(kpis.expiring90)}
            context="perlu perpanjangan kontrak"
            icon={CalendarClock}
            tone="signal"
            active={
              selectedStatus === "segera_30" ||
              selectedStatus === "segera_60" ||
              selectedStatus === "segera_90"
            }
            subBadges={
              <div className="flex items-center gap-1 text-[10px]">
                <span className="rounded bg-white/20 px-1.5 py-0.5 font-semibold text-white">
                  ≤30h: {fmtInt(kpis.expiring30)}
                </span>
                <span className="rounded bg-white/15 px-1.5 py-0.5 text-white/90">
                  ≤60h: {fmtInt(kpis.expiring60)}
                </span>
                <span className="rounded bg-white/15 px-1.5 py-0.5 text-white/90">
                  ≤90h: {fmtInt(kpis.expiring90)}
                </span>
              </div>
            }
            onClick={() => {
              const nextStatus = selectedStatus === "segera_30" ? "" : "segera_30";
              setSelectedStatus(nextStatus);
              applyFilters({ status: nextStatus });
            }}
          />

          {/* 3. Sudah Berakhir (Kedaluwarsa) */}
          <KpiCard
            label="Sudah Berakhir"
            value={fmtInt(kpis.expired)}
            context="kontrak telah lewat waktu"
            icon={Clock}
            tone="graphite"
            active={selectedStatus === "kedaluwarsa"}
            onClick={() => {
              const nextStatus = selectedStatus === "kedaluwarsa" ? "" : "kedaluwarsa";
              setSelectedStatus(nextStatus);
              applyFilters({ status: nextStatus });
            }}
          />

          {/* 4. Dibuat Bulan Ini */}
          <KpiCard
            label="Dibuat Bulan Ini"
            value={fmtInt(kpis.monthTotal)}
            context={`${fmtInt(kpis.monthMine)} dibuat oleh akun Anda`}
            icon={FileText}
            tone="blue"
            href="/history"
          />

          {/* 5. Perlu Dicek */}
          <KpiCard
            label="Perlu Dicek"
            value={fmtInt(kpis.perluDicek)}
            context="verifikasi tanggal klausa"
            icon={AlertTriangle}
            tone={kpis.perluDicek > 0 ? "gold" : "brand"}
            active={onlyPerluCek}
            onClick={() => {
              const nextVal = !onlyPerluCek;
              setOnlyPerluCek(nextVal);
              applyFilters({ perlu_dicek: nextVal });
            }}
          />
        </div>
      </section>

      {/* 4 GRAFIK UTAMA (Requirement 2) */}
      <section aria-label="Grafik Analitik Kontrak" className="space-y-4">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Grafik 1: Kontrak per Perusahaan */}
          <div className="rounded-lg border border-border bg-surface-1 p-5 shadow-xs">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-[14px] font-semibold text-text-1">
                <Building2 className="size-4 text-primary" />
                Kontrak per Perusahaan (Top 10)
              </h2>
              {selectedCompany && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCompany("");
                    applyFilters({ perusahaan: "" });
                  }}
                  className="rounded-md border border-border px-2 py-0.5 text-xs text-text-2 hover:bg-surface-2"
                >
                  {selectedCompany} ×
                </button>
              )}
            </div>
            <BusinessLineChart
              data={byCompany}
              selected={selectedCompany}
              onSelect={(name) => {
                const next = selectedCompany === name ? "" : name;
                setSelectedCompany(next);
                applyFilters({ perusahaan: next });
              }}
            />
          </div>

          {/* Grafik 2: Tren Pembuatan per Bulan */}
          <div className="rounded-lg border border-border bg-surface-1 p-5 shadow-xs">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-[14px] font-semibold text-text-1">
                <CalendarClock className="size-4 text-primary" />
                Tren Pembuatan per Bulan (6 Bulan Terakhir)
              </h2>
            </div>
            <MonthlyTrendChart
              data={trend}
              onSelectMonth={(key) => {
                applyFilters({ periode: key });
              }}
            />
          </div>

          {/* Grafik 3: Distribusi Status Dokumen */}
          <div className="rounded-lg border border-border bg-surface-1 p-5 shadow-xs">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-[14px] font-semibold text-text-1">
                <Layers className="size-4 text-primary" />
                Distribusi Status Dokumen
              </h2>
            </div>
            <StatusDistributionChart
              data={byStatus}
              selected={selectedStatus}
              onSelect={(key) => {
                const next = selectedStatus === key ? "" : key;
                setSelectedStatus(next);
                applyFilters({ status: next });
              }}
            />
          </div>

          {/* Grafik 4: Distribusi Durasi Kontrak */}
          <div className="rounded-lg border border-border bg-surface-1 p-5 shadow-xs">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-[14px] font-semibold text-text-1">
                <Clock className="size-4 text-primary" />
                Distribusi Durasi Kontrak
              </h2>
            </div>
            <DurationDistributionChart data={byDuration} />
          </div>
        </div>
      </section>

      {/* TABEL SEGERA BERAKHIR (Requirement 3) */}
      <section
        aria-labelledby="expiring-table-heading"
        className="overflow-hidden rounded-lg border border-border bg-surface-1 shadow-xs"
      >
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="expiring-table-heading" className="text-[15px] font-semibold text-text-1">
              Kontrak Segera Berakhir
            </h2>
            <p className="mt-0.5 text-xs text-text-2">
              Daftar kontrak PKWT yang akan habis masa berlakunya. Klik tombol untuk membuat perpanjangan otomatis.
            </p>
          </div>

          {/* Sub-threshold toggle (30 / 60 / 90 hari) */}
          <div className="flex items-center gap-1 rounded-md border border-border bg-surface-0 p-1 text-xs">
            {[
              { val: "30", label: "≤ 30 Hari" },
              { val: "60", label: "≤ 60 Hari" },
              { val: "90", label: "≤ 90 Hari" },
            ].map((t) => (
              <button
                key={t.val}
                type="button"
                onClick={() => setExpiringThreshold(t.val)}
                className={`rounded px-2.5 py-1 font-medium transition-colors ${
                  expiringThreshold === t.val
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "text-text-2 hover:text-text-1"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {visibleExpiring.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-5" />
            </div>
            <p className="text-sm font-semibold text-text-1">
              Tidak ada kontrak yang berakhir dalam {expiringThreshold} hari
            </p>
            <p className="mt-1 text-xs text-text-2">
              Semua masa berlaku kontrak masih aman di luar rentang waktu ini.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-surface-2/60 text-text-2">
                  <th scope="col" className="px-4 py-2.5 text-left font-semibold text-text-1">
                    Karyawan
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-left font-semibold text-text-1">
                    Nomor Surat
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-left font-semibold text-text-1">
                    Perusahaan
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-left font-semibold text-text-1">
                    Berakhir
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-center font-semibold text-text-1">
                    Sisa Waktu
                  </th>
                  <th scope="col" className="px-3 py-2.5 text-center font-semibold text-text-1">
                    Sumber
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-semibold text-text-1">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-row-border">
                {visibleExpiring.map((c) => {
                  const days = c.sisa_hari;
                  const isCritical = days !== null && days <= 14;
                  const isWarning = days !== null && days <= 30;
                  const nextStart = calculateNextStartDate(c.tanggal_berakhir);

                  return (
                    <tr key={c.id} className="hover:bg-surface-2/40 transition-colors">
                      {/* Nama Karyawan */}
                      <td className="px-4 py-3 align-middle">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-text-1">{c.nama_asli || "Tanpa Nama"}</span>
                          {c.url ? (
                            <a
                              href={c.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                            >
                              <ExternalLink className="size-3" />
                              Buka Dokumen
                            </a>
                          ) : (
                            <span className="text-[10px] text-text-2 font-mono">{c.file_id || "-"}</span>
                          )}
                        </div>
                      </td>

                      {/* Nomor Surat */}
                      <td className="px-3 py-3 align-middle font-mono text-[11px] text-text-2">
                        {c.nomor_surat || "—"}
                      </td>

                      {/* Perusahaan */}
                      <td className="px-3 py-3 align-middle">
                        {c.kode_perusahaan ? (
                          <span className="inline-flex items-center rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-text-1">
                            {c.kode_perusahaan}
                          </span>
                        ) : (
                          <span className="text-text-2">—</span>
                        )}
                      </td>

                      {/* Tanggal Berakhir */}
                      <td className="px-3 py-3 align-middle">
                        <span className="tabular font-medium text-text-1">
                          {formatIsoId(c.tanggal_berakhir)}
                        </span>
                        {c.tanggal_mulai && (
                          <span className="block text-[10px] text-text-2">
                            Mulai: {formatIsoId(c.tanggal_mulai)}
                          </span>
                        )}
                      </td>

                      {/* Sisa Hari */}
                      <td className="px-3 py-3 align-middle text-center">
                        <span
                          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold ${
                            isCritical
                              ? "bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30"
                              : isWarning
                              ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30"
                              : "bg-surface-2 text-text-2 border border-border"
                          }`}
                        >
                          <Clock className="size-3" />
                          {days === 0 ? "Hari ini" : `${days} hari lagi`}
                        </span>
                      </td>

                      {/* Sumber & Status */}
                      <td className="px-3 py-3 align-middle text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span
                            className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${
                              c.sumber === "aplikasi"
                                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                                : "bg-blue-500/10 text-blue-700 dark:text-blue-400"
                            }`}
                          >
                            {c.sumber === "aplikasi" ? "Aplikasi" : "Drive"}
                          </span>
                          <span className="text-[10px] text-text-2">
                            {c.status_dokumen || "arsip"}
                          </span>
                        </div>
                      </td>

                      {/* Aksi: Buat PKWT Perpanjangan */}
                      <td className="px-4 py-3 align-middle text-right">
                        <Link
                          href={`/generate/pkwt?employee=${c.nama_key || ""}&nama=${encodeURIComponent(
                            c.nama_asli || ""
                          )}&start=${nextStart}`}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                          title="Buka form PKWT dengan data karyawan dan tanggal perpanjangan terisi otomatis"
                        >
                          <FilePlus2 className="size-3.5" />
                          Buat Perpanjangan
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* DOKUMEN TERBARU (Mempertahankan bagian yang ada) */}
      <section
        aria-labelledby="recent-heading"
        className="overflow-hidden rounded-lg border border-border bg-surface-1 shadow-xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 id="recent-heading" className="text-[15px] font-semibold text-text-1">
            Dokumen Terbaru Dibuat
          </h2>
          <Link href="/input-dokumen" className="text-xs font-medium text-primary hover:underline">
            Lihat semua log dokumen →
          </Link>
        </div>

        {(recent || []).length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-surface-2 text-text-2">
              <Inbox className="size-5" />
            </div>
            <p className="text-sm font-semibold text-text-1">Belum ada dokumen yang dibuat</p>
            <p className="mt-1 text-xs text-text-2">
              Buat dokumen baru melalui tombol di atas atau dari menu Dokumen.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-surface-2/60 text-text-2">
                  <th scope="col" className="px-5 py-2.5 text-left font-semibold text-text-1">Nama</th>
                  <th scope="col" className="hidden px-4 py-2.5 text-left font-semibold text-text-1 lg:table-cell">
                    Nomor
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-left font-semibold text-text-1">Jenis</th>
                  <th scope="col" className="px-4 py-2.5 text-left font-semibold text-text-1">Tanggal</th>
                  <th scope="col" className="hidden px-4 py-2.5 text-left font-semibold text-text-1 md:table-cell">
                    Kontrak
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-semibold text-text-1">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-row-border">
                {recent.map((log) => {
                  const type = (log.document_type || "").toLowerCase();
                  const tile = tileFor(type);
                  return (
                    <tr key={log.id} className="hover:bg-surface-0 transition-colors">
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`flex size-6 shrink-0 items-center justify-center rounded ${tile}`}
                            aria-hidden="true"
                          >
                            <FileText className="size-3.5" />
                          </span>
                          <span className="font-medium text-text-1">
                            {log.employee_name || "Dokumen"}
                          </span>
                        </div>
                      </td>
                      <td className="hidden max-w-[160px] px-4 py-2.5 font-mono text-[11px] text-text-2 lg:table-cell truncate">
                        {log.document_number || "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${tile}`}>
                          {log.document_type?.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-text-2 tabular">
                        {fmtDate(log.created_at)}
                      </td>
                      <td className="hidden px-4 py-2.5 md:table-cell">
                        {isContractType(type) ? (
                          <ContractStateDot
                            tanggalBerakhir={toIsoDate(log.tanggal_berakhir)}
                            now={now}
                          />
                        ) : (
                          <span className="text-text-2">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <DocumentActions
                          id={log.id}
                          docUrl={log.google_doc_url}
                          documentType={type}
                          tanggalMulai={log.tanggal_mulai}
                          unfilled={log.unfilled_marks}
                        />
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
