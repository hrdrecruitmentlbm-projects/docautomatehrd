"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Clock,
  Calendar,
  AlertCircle,
  FileText,
  BarChart2,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RenewalsBarChart } from "@/components/RenewalsBarChart";
import { formatIsoId, getMonthLabel } from "@/lib/contract-lifecycle";

function getAdjacentMonth(currentMonthIso, offset) {
  if (!currentMonthIso) {
    const now = new Date();
    currentMonthIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }
  const [y, m] = currentMonthIso.split("-").map(Number);
  const d = new Date(y, m - 1 + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function RekapPerpanjanganView({ renewalsData, currentMonth }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const selectedBulan = renewalsData?.bulan || currentMonth;
  const selectedBasis = renewalsData?.basis || "mulai";
  const items = renewalsData?.items || [];
  const summary = renewalsData?.summary || {};
  const trend = renewalsData?.trend12Months || [];

  const updateUrlParams = (newParams) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newParams).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") {
        params.set(k, v);
      } else {
        params.delete(k);
      }
    });
    router.push(`/rekap-perpanjangan?${params.toString()}`);
  };

  const handleMonthChange = (bulan) => {
    updateUrlParams({ bulan });
  };

  const handlePrevMonth = () => {
    const prev = getAdjacentMonth(selectedBulan, -1);
    handleMonthChange(prev);
  };

  const handleNextMonth = () => {
    const next = getAdjacentMonth(selectedBulan, 1);
    handleMonthChange(next);
  };

  const handleBasisToggle = (basis) => {
    updateUrlParams({ basis });
  };

  const exportUrl = `/api/export-rekap-perpanjangan?bulan=${encodeURIComponent(
    selectedBulan
  )}&basis=${encodeURIComponent(selectedBasis)}`;

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-text-1 flex items-center gap-2">
            <CalendarCheck className="size-5 text-primary" />
            Rekap Perpanjangan Kontrak (PKWT)
          </h1>
          <p className="mt-1 text-xs text-text-2">
            Laporan bulanan realisasi perpanjangan kontrak karyawan, durasi kerja baru, dan perbandingan dengan masa jatuh tempo.
          </p>
        </div>

        {/* Tombol Ekspor Excel */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <a
            href={exportUrl}
            download
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-700 px-3.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-800 transition-colors"
          >
            <Download className="size-3.5" />
            Ekspor Excel
          </a>
        </div>
      </div>

      {/* Bar Pengaturan: Pemilih Bulan + Toggle Basis */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-lg border border-border bg-surface-1 p-3.5">
        {/* Navigasi Bulan */}
        <div className="flex items-center gap-2 flex-wrap">
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
              value={selectedBulan && selectedBulan !== "semua" ? selectedBulan : ""}
              onChange={(e) => handleMonthChange(e.target.value)}
              className="h-8 w-44 font-mono text-xs"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleMonthChange(currentMonth)}
              className={`h-8 text-xs ${
                selectedBulan === currentMonth ? "font-semibold text-primary" : "text-text-2 hover:text-text-1"
              }`}
            >
              Bulan Ini
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleMonthChange("semua")}
              className={`h-8 text-xs ${
                selectedBulan === "semua" ? "font-semibold text-primary" : "text-text-2 hover:text-text-1"
              }`}
            >
              Semua Periode
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

        {/* Toggle Basis Pengelompokan: Tanggal Mulai vs Tanggal Dibuat */}
        <div className="flex items-center gap-1.5 self-start md:self-auto bg-surface-2 p-1 rounded-md border border-border text-xs">
          <span className="text-[11px] text-text-2 px-2 font-medium">Dasar Rekap:</span>
          <button
            type="button"
            onClick={() => handleBasisToggle("mulai")}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              selectedBasis === "mulai"
                ? "bg-surface-0 text-text-1 shadow-xs font-semibold"
                : "text-text-2 hover:text-text-1"
            }`}
          >
            Tanggal Mulai
          </button>
          <button
            type="button"
            onClick={() => handleBasisToggle("dibuat")}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              selectedBasis === "dibuat"
                ? "bg-surface-0 text-text-1 shadow-xs font-semibold"
                : "text-text-2 hover:text-text-1"
            }`}
          >
            Tanggal Dokumen Dibuat
          </button>
        </div>
      </div>

      {/* 4 Kartu Ringkasan Atas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. Total Diperpanjang */}
        <div className="rounded-lg border border-border bg-surface-1 p-4">
          <div className="flex items-center justify-between text-xs text-text-2">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Total Diperpanjang</span>
            <Users className="size-4 text-primary" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-text-1">
              {summary.totalPerpanjangan || 0}
            </span>
            <span className="text-xs text-text-2">orang</span>
          </div>
          <p className="mt-1 text-[11px] text-text-2">
            {selectedBulan === "semua" ? "Seluruh perpanjangan tercatat" : `Bulan ${getMonthLabel(selectedBulan)}`}
          </p>
        </div>

        {/* 2. Total Bulan Perpanjangan */}
        <div className="rounded-lg border border-border bg-surface-1 p-4">
          <div className="flex items-center justify-between text-xs text-text-2">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Total Masa Kontrak Baru</span>
            <Calendar className="size-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400">
              {summary.totalBulan || 0}
            </span>
            <span className="text-xs text-text-2">bulan</span>
          </div>
          <p className="mt-1 text-[11px] text-text-2">
            Akumulasi durasi perpanjangan
          </p>
        </div>

        {/* 3. Rata-rata Durasi */}
        <div className="rounded-lg border border-border bg-surface-1 p-4">
          <div className="flex items-center justify-between text-xs text-text-2">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Rata-rata Durasi</span>
            <TrendingUp className="size-4 text-blue-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-blue-700 dark:text-blue-400">
              {summary.rataRataBulan || 0}
            </span>
            <span className="text-xs text-text-2">bulan / karyawan</span>
          </div>
          <p className="mt-1 text-[11px] text-text-2">
            Rata-rata masa perpanjangan
          </p>
        </div>

        {/* 4. Jatuh Tempo Tapi Belum Diperpanjang (Tautan ke /jatuh-tempo) */}
        <Link
          href={`/jatuh-tempo?bulan=${selectedBulan && selectedBulan !== "semua" ? selectedBulan : currentMonth}`}
          className="group rounded-lg border border-amber-200 bg-amber-50/70 dark:border-amber-950/60 dark:bg-amber-950/20 p-4 transition-all hover:border-amber-300 hover:shadow-xs"
        >
          <div className="flex items-center justify-between text-xs text-amber-800 dark:text-amber-300">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Belum Diperpanjang</span>
            <AlertCircle className="size-4 text-amber-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold tracking-tight text-amber-900 dark:text-amber-200">
              {summary.belumDiperpanjangCount || 0}
            </span>
            <span className="text-xs text-amber-800 dark:text-amber-300">orang</span>
          </div>
          <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400 group-hover:underline flex items-center gap-1">
            Buka di Jatuh Tempo →
          </p>
        </Link>
      </div>

      {/* Grafik Batang 12 Bulan Terakhir */}
      <div className="rounded-lg border border-border bg-surface-1 p-4">
        <div className="flex items-center justify-between border-b border-border/80 pb-2 mb-2">
          <div className="flex items-center gap-2">
            <BarChart2 className="size-4 text-primary" />
            <h2 className="text-sm font-semibold text-text-1">
              Tren Perpanjangan 12 Bulan Terakhir ({selectedBasis === "dibuat" ? "Berdasarkan Dokumen Dibuat" : "Berdasarkan Tanggal Mulai"})
            </h2>
          </div>
          <span className="text-xs text-text-2">Klik batang bulan untuk memilih</span>
        </div>
        <RenewalsBarChart
          data={trend}
          activeMonth={selectedBulan}
          onSelectMonth={(m) => handleMonthChange(m)}
        />
      </div>

      {/* Tabel Detail Rekap Perpanjangan */}
      <div className="overflow-hidden rounded-lg border border-border bg-surface-1">
        <div className="border-b border-border bg-surface-2 px-4 py-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-text-1">
            Daftar Karyawan Diperpanjang — {selectedBulan === "semua" ? "Semua Periode" : getMonthLabel(selectedBulan)}
          </h2>
          <span className="text-xs text-text-2">{items.length} perpanjangan</span>
        </div>

        {items.length === 0 ? (
          <div className="py-12 text-center text-text-2">
            <CalendarCheck className="size-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm font-medium text-text-1">Belum ada perpanjangan tercatat</p>
            <p className="text-xs mt-1">
              Tidak ditemukan data perpanjangan kontrak untuk periode {selectedBulan === "semua" ? "ini" : getMonthLabel(selectedBulan)}.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-2 text-text-2 border-b border-border">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Nama Karyawan</th>
                  <th className="py-2.5 px-3 font-semibold">Lini / Perusahaan</th>
                  <th className="py-2.5 px-3 font-semibold">Perpanjangan</th>
                  <th className="py-2.5 px-3 font-semibold">Akhir Kontrak Lama</th>
                  <th className="py-2.5 px-3 font-semibold">Mulai Kontrak Baru</th>
                  <th className="py-2.5 px-3 font-semibold">Durasi</th>
                  <th className="py-2.5 px-3 font-semibold">Berakhir Baru</th>
                  <th className="py-2.5 px-3 font-semibold">No. Surat & Status</th>
                  <th className="py-2.5 px-3 font-semibold">Sumber</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Tautan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => (
                  <tr key={`${item.id}_${item.perpanjangan_ke}`} className="hover:bg-surface-2/60 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-text-1">
                      {item.nama_asli}
                    </td>
                    <td className="py-2.5 px-3 text-text-2 font-mono text-[11px]">
                      {item.lini_bisnis || item.perusahaan || "-"}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="inline-flex rounded bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        {item.perpanjangan_label}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-text-2">
                      {item.tanggal_akhir_lama ? formatIsoId(item.tanggal_akhir_lama) : "-"}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-text-1">
                      {item.tanggal_mulai_baru ? formatIsoId(item.tanggal_mulai_baru) : "-"}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-text-1">
                      {item.durasi_bulan ? `${item.durasi_bulan} bln` : "-"}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-text-1">
                      {item.tanggal_berakhir_baru ? formatIsoId(item.tanggal_berakhir_baru) : "-"}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-mono text-[11px] text-text-1">{item.nomor_surat || "-"}</div>
                      <div className="text-[10px] text-text-2 capitalize mt-0.5">{item.status_dokumen}</div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[10px] font-medium text-text-2 capitalize">
                        {item.sumber === "drive" ? "Arsip Drive" : "Aplikasi"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-semibold text-primary hover:underline text-[11px]"
                        >
                          <FileText className="size-3" />
                          Buka
                          <ExternalLink className="size-2.5" />
                        </a>
                      ) : (
                        <span className="text-text-2">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
