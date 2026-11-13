"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarClock,
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
  Building2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { JatuhTempoRenewalDialog } from "@/components/JatuhTempoRenewalDialog";
import { formatIsoId, getTodayWib } from "@/lib/contract-lifecycle";

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

function getAdjacentMonth(currentMonthIso, offset) {
  const [y, m] = currentMonthIso.split("-").map(Number);
  const d = new Date(y, m - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function JatuhTempoView({
  dueData,
  initialBulan = "",
  initialStatus = "PKWT",
  initialPerusahaan = "",
  initialSearch = "",
  initialFilter = "",
  companyOptions = [],
  lastMasterSync = null,
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Active tab: 'pkwt' | 'sp'
  const [activeTab, setActiveTab] = React.useState("pkwt");

  // Filter states
  const [selectedBulan, setSelectedBulan] = React.useState(initialBulan);
  const [selectedStatus, setSelectedStatus] = React.useState(initialStatus);
  const [selectedPerusahaan, setSelectedPerusahaan] = React.useState(initialPerusahaan);
  const [searchTerm, setSearchTerm] = React.useState(initialSearch);
  const [activeQuickFilter, setActiveQuickFilter] = React.useState(initialFilter);

  // Renewal Dialog state
  const [renewalItem, setRenewalItem] = React.useState(null);
  const [renewalOpen, setRenewalOpen] = React.useState(false);

  // Synchronize state with URL parameters
  const updateUrlParams = (newParams) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newParams).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") {
        params.set(k, v);
      } else {
        params.delete(k);
      }
    });
    router.push(`/jatuh-tempo?${params.toString()}`);
  };

  const handleMonthChange = (bulan) => {
    setSelectedBulan(bulan);
    setActiveQuickFilter("");
    updateUrlParams({ bulan, filter: "" });
  };

  const handlePrevMonth = () => {
    const base = selectedBulan || getTodayWib().slice(0, 7);
    const prev = getAdjacentMonth(base, -1);
    handleMonthChange(prev);
  };

  const handleNextMonth = () => {
    const base = selectedBulan || getTodayWib().slice(0, 7);
    const next = getAdjacentMonth(base, 1);
    handleMonthChange(next);
  };

  const handleQuickFilter = (qf) => {
    const nextQf = activeQuickFilter === qf ? "" : qf;
    setActiveQuickFilter(nextQf);
    if (nextQf) {
      setSelectedBulan("");
      updateUrlParams({ filter: nextQf, bulan: "" });
    } else {
      updateUrlParams({ filter: "" });
    }
  };

  const handleApplyFilters = () => {
    updateUrlParams({
      status: selectedStatus,
      perusahaan: selectedPerusahaan,
      search: searchTerm.trim(),
      bulan: selectedBulan,
      filter: activeQuickFilter,
    });
  };

  const handleResetFilters = () => {
    const currentMonth = getTodayWib().slice(0, 7);
    setSelectedStatus("PKWT");
    setSelectedPerusahaan("");
    setSearchTerm("");
    setActiveQuickFilter("");
    setSelectedBulan(currentMonth);
    router.push(`/jatuh-tempo?status=PKWT&bulan=${currentMonth}`);
  };

  // Determine which items to display
  let displayedItems = [];
  let currentGroupLabel = "Semua Kontrak";

  if (activeQuickFilter === "lewat") {
    displayedItems = dueData?.lewat || [];
    currentGroupLabel = "Sudah Lewat & Belum Diperpanjang";
  } else if (activeQuickFilter === "hari7") {
    displayedItems = dueData?.hari7 || [];
    currentGroupLabel = "Jatuh Tempo ≤ 7 Hari";
  } else if (activeQuickFilter === "hari30") {
    displayedItems = dueData?.hari30 || [];
    currentGroupLabel = "Jatuh Tempo ≤ 30 Hari";
  } else if (selectedBulan) {
    const group = dueData?.groups?.find((g) => g.bulan === selectedBulan);
    displayedItems = group?.items || [];
    currentGroupLabel = group ? group.label : selectedBulan;
  } else {
    displayedItems = dueData?.groups?.flatMap((g) => g.items) || [];
  }

  // Build Excel Export link
  const exportQs = new URLSearchParams({
    status: selectedStatus || "PKWT",
    ...(selectedPerusahaan ? { perusahaan: selectedPerusahaan } : {}),
    ...(searchTerm.trim() ? { search: searchTerm.trim() } : {}),
    ...(activeQuickFilter ? { filter: activeQuickFilter } : {}),
    ...(selectedBulan && !activeQuickFilter ? { bulan: selectedBulan } : {}),
  }).toString();

  const exportUrl = `/api/export-jatuh-tempo?${exportQs}`;

  return (
    <div className="space-y-5 max-w-7xl">
      {/* Header Halaman & Tab Navigasi Dokumen (PKWT | SP) */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text-1 flex items-center gap-2">
            <CalendarClock className="size-5 text-primary" />
            Jatuh Tempo Kontrak & Dokumen
          </h1>
          <p className="mt-1 text-xs text-text-2">
            Pantau dan tindak lanjuti PKWT yang mendekati masa berakhir berdasarkan data Google Sheet & dokumen terpadu.
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
          PKWT (Kontrak Kerja)
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
            {dueData?.groups?.reduce((acc, g) => acc + g.items.length, 0) || 0}
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
            Segera hadir (Bagian 4)
          </span>
        </button>
      </div>

      {/* KONTEN TAB SP */}
      {activeTab === "sp" && (
        <div className="rounded-lg border border-border bg-surface-1 p-8 text-center">
          <Clock className="size-8 text-text-2 mx-auto mb-2 opacity-50" />
          <h3 className="text-base font-semibold text-text-1">Fitur Jatuh Tempo SP Segera Hadir</h3>
          <p className="mt-1 text-xs text-text-2 max-w-md mx-auto">
            Pelacakan masa berlaku Surat Peringatan (SP1, SP2, SP3) sedang disiapkan dan akan diaktifkan pada Bagian 4.
          </p>
        </div>
      )}

      {/* KONTEN TAB PKWT */}
      {activeTab === "pkwt" && (
        <>
          {/* BAR KARTU RINGKASAN & FILTER CEPAT */}
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
              <span className="text-[11px] text-text-2 mt-0.5">Mendesak diproses</span>
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
              <span className="text-[11px] text-text-2 mt-0.5">Perlu disiapkan</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const thisM = getTodayWib().slice(0, 7);
                handleMonthChange(thisM);
              }}
              className={`flex flex-col text-left p-3.5 rounded-lg border transition-all ${
                selectedBulan === getTodayWib().slice(0, 7) && !activeQuickFilter
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                  : "border-border bg-surface-1 hover:bg-surface-2"
              }`}
            >
              <span className="text-xs font-medium text-text-2">Bulan Ini</span>
              <span className="text-2xl font-bold text-text-1 mt-1">
                {dueData?.bulanIni?.length || 0}
              </span>
              <span className="text-[11px] text-text-2 mt-0.5">Bulan berjalan</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const nextM = getAdjacentMonth(getTodayWib().slice(0, 7), 1);
                handleMonthChange(nextM);
              }}
              className={`flex flex-col text-left p-3.5 rounded-lg border transition-all col-span-2 sm:col-span-1 ${
                selectedBulan === getAdjacentMonth(getTodayWib().slice(0, 7), 1) && !activeQuickFilter
                  ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                  : "border-border bg-surface-1 hover:bg-surface-2"
              }`}
            >
              <span className="text-xs font-medium text-text-2">Bulan Depan</span>
              <span className="text-2xl font-bold text-text-1 mt-1">
                {dueData?.bulanDepan?.length || 0}
              </span>
              <span className="text-[11px] text-text-2 mt-0.5">Bulan berikutnya</span>
            </button>
          </div>

          {/* BAR NAVIGASI BULAN & TOMBOL EKSPOR */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-lg border border-border bg-surface-1 p-3.5">
            {/* Navigasi Bulan */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePrevMonth}
                className="h-8 px-2"
                title="Bulan sebelumnya"
              >
                <ChevronLeft className="size-4" />
              </Button>

              <div className="flex items-center gap-2">
                <Input
                  type="month"
                  value={selectedBulan || ""}
                  onChange={(e) => handleMonthChange(e.target.value)}
                  className="h-8 w-44 font-mono text-xs"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleMonthChange(getTodayWib().slice(0, 7))}
                  className="h-8 text-xs text-text-2 hover:text-text-1"
                >
                  Bulan Ini
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleMonthChange("")}
                  className={`h-8 text-xs ${!selectedBulan && !activeQuickFilter ? "font-semibold text-primary" : "text-text-2"}`}
                >
                  Semua Bulan
                </Button>
              </div>

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

            {/* Tombol Ekspor Excel */}
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

          {/* BAR FILTER (Perusahaan, Status, Search) */}
          <div className="rounded-lg border border-border bg-surface-1 p-3.5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {/* Filter Perusahaan */}
              <div>
                <Label className="text-[11px] text-text-2 mb-1 block">Perusahaan / Lini</Label>
                <select
                  value={selectedPerusahaan}
                  onChange={(e) => setSelectedPerusahaan(e.target.value)}
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

              {/* Filter Status (Default PKWT) */}
              <div>
                <Label className="text-[11px] text-text-2 mb-1 block">Status Karyawan</Label>
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="h-8 w-full rounded-md border border-border bg-surface-0 px-2.5 text-xs text-text-1 focus:border-primary focus:outline-none font-medium"
                >
                  <option value="PKWT">Hanya PKWT (Default)</option>
                  <option value="FREELANCE">Freelance</option>
                  <option value="TRAINING">Training</option>
                  <option value="semua">Semua Status Kontrak</option>
                </select>
              </div>

              {/* Pencarian Nama / NIK */}
              <div className="sm:col-span-2">
                <Label className="text-[11px] text-text-2 mb-1 block">Cari Nama / NIK</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 size-3.5 text-text-2" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleApplyFilters();
                    }}
                    placeholder="Ketik nama karyawan atau NIK internal..."
                    className="h-8 pl-8 text-xs font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border/60 pt-2.5">
              <span className="text-[11px] text-text-2">
                Menampilkan <strong className="text-text-1">{displayedItems.length}</strong> karyawan ({currentGroupLabel}).
              </span>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleResetFilters}
                  className="h-7 text-xs text-text-2"
                >
                  <RotateCcw className="size-3 mr-1" />
                  Reset
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleApplyFilters}
                  className="h-7 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Filter className="size-3 mr-1" />
                  Terapkan Filter
                </Button>
              </div>
            </div>
          </div>

          {/* TABEL UTAMA JATUH TEMPO */}
          <div className="overflow-hidden rounded-lg border border-border bg-surface-1">
            <div className="border-b border-border bg-surface-2 px-4 py-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-1">
                Daftar Jatuh Tempo — {currentGroupLabel}
              </h2>
              <span className="text-xs text-text-2">{displayedItems.length} karyawan</span>
            </div>

            {displayedItems.length === 0 ? (
              <div className="py-12 text-center text-text-2">
                <Users className="size-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium text-text-1">Tidak ada kontrak jatuh tempo</p>
                <p className="text-xs mt-1">
                  Tidak ditemukan karyawan yang jatuh tempo untuk filter bulan atau kriteria yang dipilih.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-2 text-text-2 border-b border-border">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold">Nama / NIK</th>
                      <th className="py-2.5 px-3 font-semibold">Posisi / Divisi</th>
                      <th className="py-2.5 px-3 font-semibold">Lini Bisnis</th>
                      <th className="py-2.5 px-3 font-semibold">Status</th>
                      <th className="py-2.5 px-3 font-semibold">Tanggal Masuk</th>
                      <th className="py-2.5 px-3 font-semibold">Habis Kontrak</th>
                      <th className="py-2.5 px-3 font-semibold">Sisa Hari</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {displayedItems.map((item) => {
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
                            {isExpired ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-950/60 px-2 py-0.5 text-[11px] font-bold text-red-700 dark:text-red-400">
                                {item.sisa_hari} hari (Lewat)
                              </span>
                            ) : isNear ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-300">
                                {item.sisa_hari} hari lagi
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
                                {item.sisa_hari} hari
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right">
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
