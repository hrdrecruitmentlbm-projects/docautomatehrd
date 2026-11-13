"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarClock,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Search,
  Sparkles,
  AlertTriangle,
  Clock,
  ExternalLink,
  RotateCcw,
  RefreshCw,
  CheckCircle2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { JatuhTempoRenewalDialog } from "@/components/JatuhTempoRenewalDialog";
import {
  formatIsoId,
  getTodayWib,
  getMonthLabel,
  getAdjacentMonthIso,
} from "@/lib/contract-lifecycle";

function formatSyncTime(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (isNaN(d)) return null;
  return (
    new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d) + " WIB"
  );
}

export function JatuhTempoView({
  dueData,
  currentMonth = "",
  initialBulan = "",
  initialStatus = "semua",
  initialPerusahaan = "",
  initialSearch = "",
  initialFilter = "",
  initialOnlyUnrenewed = false,
  companyOptions = [],
  lastMasterSync = null,
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Tab aktif: 'pkwt' | 'sp'
  const [activeTab, setActiveTab] = React.useState("pkwt");

  // Derivasikan filter URL langsung dari searchParams agar selalu sinkron dengan navigasi
  const spFilter = searchParams.get("filter");
  const activeQuickFilter = spFilter !== null ? spFilter : initialFilter;

  const spBulan = searchParams.get("bulan");
  const fallbackMonth = currentMonth || getTodayWib().slice(0, 7);
  const selectedBulan = activeQuickFilter
    ? ""
    : spBulan !== null
      ? spBulan
      : initialBulan || fallbackMonth;

  const spStatus = searchParams.get("status");
  const selectedStatus = spStatus !== null ? spStatus : initialStatus;

  const spPerusahaan = searchParams.get("perusahaan");
  const selectedPerusahaan = spPerusahaan !== null ? spPerusahaan : initialPerusahaan;

  const spSearch = searchParams.get("search");
  const activeSearch = spSearch !== null ? spSearch : initialSearch;

  const spBelum = searchParams.get("belum");
  const onlyUnrenewed =
    spBelum !== null ? spBelum === "1" || spBelum === "true" : initialOnlyUnrenewed;

  // Input pencarian lokal (dikirim saat Enter / klik Terapkan Filter)
  const [searchInput, setSearchInput] = React.useState(activeSearch);

  // Dialog Buat Perpanjangan
  const [renewalItem, setRenewalItem] = React.useState(null);
  const [renewalOpen, setRenewalOpen] = React.useState(false);

  const updateUrlParams = (patch) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(patch).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") {
        params.set(k, v);
      } else {
        params.delete(k);
      }
    });
    const qs = params.toString();
    router.push(qs ? `/jatuh-tempo?${qs}` : "/jatuh-tempo");
  };

  const handleMonthChange = (bulan) => {
    updateUrlParams({
      bulan: bulan || "semua",
      filter: "",
    });
  };

  const handlePrevMonth = () => {
    const base =
      selectedBulan && selectedBulan !== "semua" ? selectedBulan : fallbackMonth;
    handleMonthChange(getAdjacentMonthIso(base, -1));
  };

  const handleNextMonth = () => {
    const base =
      selectedBulan && selectedBulan !== "semua" ? selectedBulan : fallbackMonth;
    handleMonthChange(getAdjacentMonthIso(base, 1));
  };

  const handleQuickFilter = (qf) => {
    const nextQf = activeQuickFilter === qf ? "" : qf;
    if (nextQf) {
      updateUrlParams({ filter: nextQf, bulan: "" });
    } else {
      updateUrlParams({ filter: "", bulan: fallbackMonth });
    }
  };

  const handleToggleUnrenewed = (checked) => {
    updateUrlParams({
      belum: checked ? "1" : "",
    });
  };

  const handleApplySearch = () => {
    updateUrlParams({
      search: searchInput.trim(),
    });
  };

  const handleResetFilters = () => {
    setSearchInput("");
    router.push(`/jatuh-tempo?bulan=${fallbackMonth}`);
  };

  // Tentukan kumpulan item sebelum filter "Belum diperpanjang saja"
  let rawScopeItems = [];
  let currentGroupLabel = "Semua Bulan";

  if (activeQuickFilter === "lewat") {
    rawScopeItems = dueData?.lewat || [];
    currentGroupLabel = "Sudah Lewat & Belum Diperpanjang";
  } else if (activeQuickFilter === "hari7") {
    rawScopeItems = dueData?.hari7 || [];
    currentGroupLabel = "Jatuh Tempo ≤ 7 Hari";
  } else if (activeQuickFilter === "hari30") {
    rawScopeItems = dueData?.hari30 || [];
    currentGroupLabel = "Jatuh Tempo ≤ 30 Hari";
  } else if (selectedBulan && selectedBulan !== "semua") {
    const group = dueData?.groups?.find((g) => g.bulan === selectedBulan);
    rawScopeItems = group?.items || [];
    currentGroupLabel = getMonthLabel(selectedBulan) || selectedBulan;
  } else {
    rawScopeItems = dueData?.groups?.flatMap((g) => g.items) || [];
    currentGroupLabel = "Semua Bulan";
  }

  // Ringkasan bulan / scope yang sedang dibuka (sebelum toggle "Belum diperpanjang saja")
  const totalHabisKontrak = rawScopeItems.length;
  const totalSudahDiperpanjang = rawScopeItems.filter((i) => i.sudah_diperpanjang).length;
  const totalBelumDiperpanjang = totalHabisKontrak - totalSudahDiperpanjang;

  // Terapkan filter "Belum diperpanjang saja" (default MATI)
  const displayedItems = onlyUnrenewed
    ? rawScopeItems.filter((i) => !i.sudah_diperpanjang)
    : rawScopeItems;

  const totalAllUnrenewed =
    (dueData?.groups || []).reduce((acc, g) => acc + (g.belumDiperpanjang || 0), 0);

  // URL Ekspor Excel mengikuti bulan dan seluruh filter aktif
  const exportQs = new URLSearchParams({
    status: selectedStatus || "semua",
    ...(selectedPerusahaan ? { perusahaan: selectedPerusahaan } : {}),
    ...(activeSearch ? { search: activeSearch } : {}),
    ...(activeQuickFilter ? { filter: activeQuickFilter } : {}),
    ...(selectedBulan && !activeQuickFilter ? { bulan: selectedBulan } : {}),
    ...(onlyUnrenewed ? { belum: "1" } : {}),
  }).toString();

  const exportUrl = `/api/export-jatuh-tempo?${exportQs}`;
  const ringkasan12Bulan = dueData?.ringkasan12Bulan || [];

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text-1 flex items-center gap-2">
            <CalendarClock className="size-5 text-primary" />
            Jatuh Tempo Kontrak & Dokumen
          </h1>
          <p className="mt-1 text-xs text-text-2">
            Pantau seluruh karyawan yang kontraknya berakhir per bulan berdasarkan kolom J Bank Data Karyawan beserta status perpanjangannya.
          </p>
        </div>

        {/* Sync Status Banner */}
        <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-1.5 text-xs text-text-2">
          <span>
            Data Sheet:{" "}
            <span className="font-medium text-text-1">
              {formatSyncTime(lastMasterSync) || "Belum disinkron"}
            </span>
          </span>
          <Link
            href="/data"
            className="inline-flex items-center gap-1 font-semibold text-primary hover:underline ml-1"
          >
            <RefreshCw className="size-3" />
            Sync Ulang
          </Link>
        </div>
      </div>

      {/* STRUKTUR TAB (PKWT | SP) */}
      <div className="flex border-b border-border gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("pkwt")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === "pkwt"
              ? "border-primary text-primary"
              : "border-transparent text-text-2 hover:text-text-1"
          }`}
        >
          PKWT / Kontrak Kerja
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
            {totalAllUnrenewed} belum diperpanjang
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("sp")}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === "sp"
              ? "border-primary text-primary"
              : "border-transparent text-text-2 hover:text-text-1"
          }`}
        >
          SP (Surat Peringatan)
          <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-normal text-text-2">
            Bagian 4
          </span>
        </button>
      </div>

      {/* KONTEN TAB SP */}
      {activeTab === "sp" && (
        <div className="rounded-lg border border-border bg-surface-1 p-8 text-center">
          <Clock className="size-8 text-text-2 mx-auto mb-2 opacity-50" />
          <h3 className="text-base font-semibold text-text-1">Pantauan Masa Berlaku SP</h3>
          <p className="mt-1 text-xs text-text-2 max-w-md mx-auto">
            Surat Peringatan (SP1, SP2, SP3) yang memiliki masa berlaku dilacak di log dokumen dan notifikasi.
          </p>
        </div>
      )}

      {/* KONTEN TAB PKWT */}
      {activeTab === "pkwt" && (
        <>
          {/* BAR KARTU TINDAKAN CEPAT (Hanya Belum Diperpanjang) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <button
              type="button"
              onClick={() => handleQuickFilter("lewat")}
              className={`flex flex-col text-left p-3.5 rounded-lg border transition-all ${
                activeQuickFilter === "lewat"
                  ? "border-red-500 bg-red-50/70 dark:bg-red-950/30 ring-2 ring-red-500/20"
                  : "border-border bg-surface-1 hover:bg-surface-2"
              }`}
            >
              <span className="text-xs font-medium text-red-700 dark:text-red-400">Sudah Lewat</span>
              <span className="text-2xl font-bold text-red-800 dark:text-red-300 mt-1">
                {dueData?.lewat?.length || 0}
              </span>
              <span className="text-[11px] text-text-2 mt-0.5">Belum diperpanjang</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickFilter("hari7")}
              className={`flex flex-col text-left p-3.5 rounded-lg border transition-all ${
                activeQuickFilter === "hari7"
                  ? "border-amber-500 bg-amber-50/70 dark:bg-amber-950/30 ring-2 ring-amber-500/20"
                  : "border-border bg-surface-1 hover:bg-surface-2"
              }`}
            >
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400">≤ 7 Hari</span>
              <span className="text-2xl font-bold text-amber-800 dark:text-amber-300 mt-1">
                {dueData?.hari7?.length || 0}
              </span>
              <span className="text-[11px] text-text-2 mt-0.5">Belum diperpanjang</span>
            </button>

            <button
              type="button"
              onClick={() => handleQuickFilter("hari30")}
              className={`flex flex-col text-left p-3.5 rounded-lg border transition-all ${
                activeQuickFilter === "hari30"
                  ? "border-amber-500 bg-amber-50/70 dark:bg-amber-950/30 ring-2 ring-amber-500/20"
                  : "border-border bg-surface-1 hover:bg-surface-2"
              }`}
            >
              <span className="text-xs font-medium text-amber-700 dark:text-amber-400">≤ 30 Hari</span>
              <span className="text-2xl font-bold text-amber-800 dark:text-amber-300 mt-1">
                {dueData?.hari30?.length || 0}
              </span>
              <span className="text-[11px] text-text-2 mt-0.5">Belum diperpanjang</span>
            </button>

            <button
              type="button"
              onClick={() => handleMonthChange(fallbackMonth)}
              className={`flex flex-col text-left p-3.5 rounded-lg border transition-all ${
                selectedBulan === fallbackMonth && !activeQuickFilter
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                  : "border-border bg-surface-1 hover:bg-surface-2"
              }`}
            >
              <span className="text-xs font-medium text-text-2">Bulan Ini (Belum)</span>
              <span className="text-2xl font-bold text-text-1 mt-1">
                {dueData?.bulanIni?.length || 0}
              </span>
              <span className="text-[11px] text-text-2 mt-0.5">{getMonthLabel(fallbackMonth)}</span>
            </button>

            <button
              type="button"
              onClick={() => handleMonthChange(getAdjacentMonthIso(fallbackMonth, 1))}
              className={`flex flex-col text-left p-3.5 rounded-lg border transition-all col-span-2 sm:col-span-1 ${
                selectedBulan === getAdjacentMonthIso(fallbackMonth, 1) && !activeQuickFilter
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                  : "border-border bg-surface-1 hover:bg-surface-2"
              }`}
            >
              <span className="text-xs font-medium text-text-2">Bulan Depan (Belum)</span>
              <span className="text-2xl font-bold text-text-1 mt-1">
                {dueData?.bulanDepan?.length || 0}
              </span>
              <span className="text-[11px] text-text-2 mt-0.5">
                {getMonthLabel(getAdjacentMonthIso(fallbackMonth, 1))}
              </span>
            </button>
          </div>

          {/* RINGKASAN 12 BULAN (3 bulan lalu s.d. 9 bulan ke depan) */}
          {ringkasan12Bulan.length > 0 && (
            <div className="rounded-lg border border-border bg-surface-1 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar className="size-4 text-primary" />
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-text-1">
                    Ringkasan 12 Bulan
                  </h2>
                </div>
                <span className="text-[11px] text-text-2">
                  Klik bulan untuk melihat seluruh daftar karyawan
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {ringkasan12Bulan.map((m) => {
                  const isSelected = !activeQuickFilter && selectedBulan === m.bulan;
                  return (
                    <button
                      key={m.bulan}
                      type="button"
                      onClick={() => handleMonthChange(m.bulan)}
                      className={`flex flex-col text-left rounded-md border p-2.5 transition-all ${
                        isSelected
                          ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                          : "border-border bg-surface-0 hover:bg-surface-2"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1 w-full">
                        <span className="text-xs font-semibold text-text-1 truncate">
                          {m.label}
                        </span>
                        {m.isCurrent && (
                          <span className="shrink-0 rounded bg-primary/15 px-1 py-0.5 text-[9px] font-bold text-primary">
                            Ini
                          </span>
                        )}
                      </div>

                      <div className="mt-1.5 flex items-baseline justify-between gap-1">
                        <span className="text-sm font-bold text-text-1">
                          {m.total} <span className="text-[10px] font-normal text-text-2">habis</span>
                        </span>
                      </div>

                      <div className="mt-1">
                        {m.total === 0 ? (
                          <span className="text-[10px] text-text-2">Tidak ada</span>
                        ) : m.belumDiperpanjang > 0 ? (
                          <span className="inline-block rounded bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                            {m.belumDiperpanjang} belum diperpanjang
                          </span>
                        ) : (
                          <span className="inline-block rounded bg-emerald-100 dark:bg-emerald-950/60 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300">
                            Semua diperpanjang
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* BAR NAVIGASI BULAN & TOMBOL EKSPOR */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-lg border border-border bg-surface-1 p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevMonth}
                className="h-8 px-2"
                title="Bulan sebelumnya"
              >
                <ChevronLeft className="size-4" />
              </Button>

              <Input
                type="month"
                value={selectedBulan && selectedBulan !== "semua" ? selectedBulan : ""}
                onChange={(e) => handleMonthChange(e.target.value)}
                className="h-8 w-44 font-mono text-xs"
              />

              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleMonthChange(fallbackMonth)}
                className={`h-8 text-xs ${
                  selectedBulan === fallbackMonth && !activeQuickFilter
                    ? "font-semibold text-primary"
                    : "text-text-2 hover:text-text-1"
                }`}
              >
                Bulan Ini
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleMonthChange("semua")}
                className={`h-8 text-xs ${
                  selectedBulan === "semua" && !activeQuickFilter
                    ? "font-semibold text-primary"
                    : "text-text-2 hover:text-text-1"
                }`}
              >
                Semua Bulan
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={handleNextMonth}
                className="h-8 px-2"
                title="Bulan berikutnya"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2 self-end md:self-auto">
              <a
                href={exportUrl}
                download
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-emerald-700 px-3 text-xs font-medium text-white shadow-sm hover:bg-emerald-800 transition-colors"
              >
                <Download className="size-3.5" />
                Ekspor Excel
              </a>
            </div>
          </div>

          {/* BAR FILTER (Perusahaan, Status Kontrak, Search, Toggle Belum Diperpanjang Saja) */}
          <div className="rounded-lg border border-border bg-surface-1 p-3.5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {/* Filter Perusahaan */}
              <div>
                <Label className="text-[11px] text-text-2 mb-1 block">Perusahaan / Lini</Label>
                <select
                  value={selectedPerusahaan}
                  onChange={(e) => updateUrlParams({ perusahaan: e.target.value })}
                  className="h-8 w-full rounded-md border border-border bg-surface-0 px-2.5 text-xs text-text-1 focus:border-primary focus:outline-none"
                >
                  <option value="">Semua Perusahaan</option>
                  {companyOptions.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter Tipe Karyawan */}
              <div>
                <Label className="text-[11px] text-text-2 mb-1 block">Status Karyawan</Label>
                <select
                  value={selectedStatus}
                  onChange={(e) => updateUrlParams({ status: e.target.value })}
                  className="h-8 w-full rounded-md border border-border bg-surface-0 px-2.5 text-xs text-text-1 focus:border-primary focus:outline-none font-medium"
                >
                  <option value="semua">Semua Kontrak (PKWT / Freelance / Training)</option>
                  <option value="PKWT">Hanya PKWT</option>
                  <option value="FREELANCE">Freelance</option>
                  <option value="TRAINING">Training</option>
                </select>
              </div>

              {/* Pencarian Nama / NIK */}
              <div className="sm:col-span-2">
                <Label className="text-[11px] text-text-2 mb-1 block">Cari Nama / NIK</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-2 size-3.5 text-text-2" />
                    <Input
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleApplySearch();
                      }}
                      placeholder="Ketik nama karyawan atau NIK internal..."
                      className="h-8 pl-8 text-xs font-mono"
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleApplySearch}
                    className="h-8 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                  >
                    <Filter className="size-3 mr-1" />
                    Cari
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5">
              {/* Toggle Filter Belum Diperpanjang Saja (Default MATI) */}
              <label className="inline-flex items-center gap-2 cursor-pointer select-none text-xs font-medium text-text-1">
                <input
                  type="checkbox"
                  checked={onlyUnrenewed}
                  onChange={(e) => handleToggleUnrenewed(e.target.checked)}
                  className="size-4 rounded border-border accent-primary cursor-pointer"
                />
                <span>Belum diperpanjang saja</span>
                <span className="text-[11px] font-normal text-text-2">
                  (tampilkan hanya yang belum ada perpanjangan)
                </span>
              </label>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                className="h-7 text-xs text-text-2"
              >
                <RotateCcw className="size-3 mr-1" />
                Reset Filter
              </Button>
            </div>
          </div>

          {/* RINGKASAN BULAN DI ATAS TABEL */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-surface-1 px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-medium text-text-2">
                  Total Habis Kontrak ({currentGroupLabel})
                </div>
                <div className="text-2xl font-bold text-text-1 mt-0.5">
                  {totalHabisKontrak}
                </div>
              </div>
              <Users className="size-5 text-text-2 opacity-60" />
            </div>

            <div className="rounded-lg border border-emerald-200 dark:border-emerald-950/60 bg-emerald-50/50 dark:bg-emerald-950/20 px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                  Sudah Diperpanjang
                </div>
                <div className="text-2xl font-bold text-emerald-800 dark:text-emerald-300 mt-0.5">
                  {totalSudahDiperpanjang}
                </div>
              </div>
              <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400 opacity-75" />
            </div>

            <div className="rounded-lg border border-amber-200 dark:border-amber-950/60 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3 flex items-center justify-between">
              <div>
                <div className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                  Belum Diperpanjang
                </div>
                <div className="text-2xl font-bold text-amber-800 dark:text-amber-300 mt-0.5">
                  {totalBelumDiperpanjang}
                </div>
              </div>
              <AlertTriangle className="size-5 text-amber-600 dark:text-amber-400 opacity-75" />
            </div>
          </div>

          {/* TABEL UTAMA JATUH TEMPO */}
          <div className="overflow-hidden rounded-lg border border-border bg-surface-1">
            <div className="border-b border-border bg-surface-2 px-4 py-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-1">
                Daftar Kontrak Berakhir — {currentGroupLabel}
              </h2>
              <span className="text-xs text-text-2">
                Menampilkan {displayedItems.length} dari {totalHabisKontrak} karyawan
              </span>
            </div>

            {displayedItems.length === 0 ? (
              <div className="py-12 px-4 text-center text-text-2">
                <Users className="size-8 mx-auto mb-2 opacity-40" />
                {onlyUnrenewed && totalHabisKontrak > 0 ? (
                  <>
                    <p className="text-sm font-medium text-text-1">
                      Semua kontrak pada bulan ini sudah diperpanjang
                    </p>
                    <p className="text-xs mt-1">
                      Ada {totalHabisKontrak} karyawan yang berakhir di {currentGroupLabel} dan semuanya sudah diperpanjang.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleUnrenewed(false)}
                      className="mt-3 h-7 text-xs"
                    >
                      Tampilkan Semua Status
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-text-1">
                      Tidak ada kontrak yang berakhir di bulan ini
                    </p>
                    <p className="text-xs mt-1">
                      Tidak ditemukan karyawan PKWT, Freelance, atau Training dengan tanggal habis kontrak pada {currentGroupLabel}.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-2 text-text-2 border-b border-border">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold">Nama / NIK</th>
                      <th className="py-2.5 px-3 font-semibold">Posisi / Divisi</th>
                      <th className="py-2.5 px-3 font-semibold">Lini Bisnis</th>
                      <th className="py-2.5 px-3 font-semibold">Tipe</th>
                      <th className="py-2.5 px-3 font-semibold">Tanggal Masuk</th>
                      <th className="py-2.5 px-3 font-semibold">Habis Kontrak</th>
                      <th className="py-2.5 px-3 font-semibold">Status</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {displayedItems.map((item) => {
                      const isRenewed = Boolean(item.sudah_diperpanjang);
                      const isExpired = item.sisa_hari < 0;
                      const isNear = item.sisa_hari >= 0 && item.sisa_hari <= 30;

                      return (
                        <tr key={item.id || item.nama_key} className="hover:bg-surface-2/60 transition-colors">
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-text-1">{item.nama_asli}</div>
                            {item.nik_internal && item.nik_internal !== "-" && (
                              <div className="font-mono text-[11px] text-text-2">NIK: {item.nik_internal}</div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-text-1">
                            <div>{item.posisi || "-"}</div>
                            <div className="text-[11px] text-text-2">{item.divisi || "-"}</div>
                          </td>
                          <td className="py-2.5 px-3 text-text-2 font-mono text-[11px]">
                            {item.lini_bisnis || item.unit || "-"}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-semibold text-text-2 uppercase">
                              {item.status_karyawan}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-text-2">
                            {item.tanggal_masuk ? formatIsoId(item.tanggal_masuk) : "-"}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-medium text-text-1">{item.tanggal_habis_id}</div>
                            {item.selisih_dokumen && (
                              <div
                                className="mt-1 inline-flex items-center gap-1 rounded bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.5 text-[10px] text-amber-800 dark:text-amber-300 font-medium"
                                title={`Tanggal dokumen fisik (${formatIsoId(item.selisih_dokumen.dokumen)}) berbeda dari Sheet (${formatIsoId(item.selisih_dokumen.sheet)})`}
                              >
                                <AlertTriangle className="size-3 shrink-0" />
                                <span>Dokumen: {formatIsoId(item.selisih_dokumen.dokumen)}</span>
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            {isRenewed ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-[11px] font-bold text-emerald-800 dark:text-emerald-300">
                                  Sudah diperpanjang
                                </span>
                                {item.tanggal_berakhir_baru_id ? (
                                  <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
                                    s.d. {item.tanggal_berakhir_baru_id}
                                  </div>
                                ) : item.tanggal_mulai_baru ? (
                                  <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
                                    Mulai {formatIsoId(item.tanggal_mulai_baru)}
                                  </div>
                                ) : null}
                              </div>
                            ) : isExpired ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-950/60 px-2 py-0.5 text-[11px] font-bold text-red-700 dark:text-red-400">
                                  Belum diperpanjang
                                </span>
                                <div className="text-[11px] text-red-700 dark:text-red-400 font-medium">
                                  Lewat {Math.abs(item.sisa_hari)} hari
                                </div>
                              </div>
                            ) : isNear ? (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-300">
                                  Belum diperpanjang
                                </span>
                                <div className="text-[11px] text-amber-800 dark:text-amber-300 font-medium">
                                  {item.sisa_hari} hari lagi
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-0.5">
                                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                                  Belum diperpanjang
                                </span>
                                <div className="text-[11px] text-text-2">
                                  {item.sisa_hari} hari lagi
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {isRenewed ? (
                              <div className="inline-flex items-center justify-end gap-1.5">
                                {item.renewal_url && (
                                  <a
                                    href={item.renewal_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex h-7 items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 dark:border-emerald-800 px-2.5 text-[11px] font-medium text-emerald-800 dark:text-emerald-300 hover:bg-emerald-100 transition-colors"
                                  >
                                    Lihat PKWT
                                    <ExternalLink className="size-3" />
                                  </a>
                                )}
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setRenewalItem(item);
                                    setRenewalOpen(true);
                                  }}
                                  className="h-7 text-[11px] text-text-2"
                                >
                                  Salin
                                </Button>
                              </div>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => {
                                  setRenewalItem(item);
                                  setRenewalOpen(true);
                                }}
                                className="h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                              >
                                <Sparkles className="size-3 mr-1" />
                                Buat Perpanjangan
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* BAGIAN TERPISAH: PERLU DILENGKAPI */}
          {dueData?.perluDilengkapi?.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50/70 dark:bg-amber-950/20 p-4 space-y-3">
              <div className="flex items-start gap-2 text-amber-900 dark:text-amber-200">
                <AlertTriangle className="size-5 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold">
                    Perlu Dilengkapi: {dueData.perluDilengkapi.length} Karyawan Kontrak Belum Memiliki Tanggal Akhir
                  </h3>
                  <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-300">
                    Karyawan berikut berstatus PKWT/Freelance/Training tetapi tanggal habis kontraknya masih kosong di Google Sheet.
                    Silakan isi kolom J (<span className="font-mono font-semibold">TANGGAL HABIS KONTRAK</span>) di Bank Data Karyawan lalu sync ulang.
                  </p>
                </div>
              </div>

              <div className="max-h-60 overflow-y-auto rounded-md border border-amber-200 bg-surface-0">
                <table className="w-full text-left text-xs">
                  <thead className="bg-amber-100/60 text-amber-950 dark:bg-amber-900/40 dark:text-amber-100">
                    <tr>
                      <th className="py-2 px-3 font-semibold">Nama Karyawan</th>
                      <th className="py-2 px-3 font-semibold">NIK</th>
                      <th className="py-2 px-3 font-semibold">Posisi / Divisi</th>
                      <th className="py-2 px-3 font-semibold">Lini Bisnis</th>
                      <th className="py-2 px-3 font-semibold">Status</th>
                      <th className="py-2 px-3 font-semibold">Tgl Masuk</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100 dark:divide-amber-900/40">
                    {dueData.perluDilengkapi.map((emp) => (
                      <tr key={emp.id || emp.nama_key} className="hover:bg-amber-50/50">
                        <td className="py-2 px-3 font-medium text-text-1">{emp.nama_asli}</td>
                        <td className="py-2 px-3 font-mono text-[11px] text-text-2">{emp.nik_internal || "-"}</td>
                        <td className="py-2 px-3 text-text-2">{emp.posisi || "-"} ({emp.divisi || "-"})</td>
                        <td className="py-2 px-3 text-text-2 font-mono text-[11px]">{emp.lini_bisnis || "-"}</td>
                        <td className="py-2 px-3">
                          <span className="rounded bg-amber-200/80 dark:bg-amber-900/80 px-1.5 py-0.2 text-[10px] text-amber-900 dark:text-amber-200 uppercase font-semibold">
                            {emp.status_karyawan}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-text-2">
                          {emp.tanggal_masuk ? formatIsoId(emp.tanggal_masuk) : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end pt-1">
                <Link
                  href="/data"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                >
                  Buka Halaman Data Karyawan untuk Sync Ulang
                  <ExternalLink className="size-3" />
                </Link>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal Dialog Buat Perpanjangan */}
      <JatuhTempoRenewalDialog
        item={renewalItem}
        open={renewalOpen}
        onOpenChange={setRenewalOpen}
      />
    </div>
  );
}
