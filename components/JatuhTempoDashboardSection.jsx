"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarClock,
  AlertTriangle,
  Clock,
  ChevronRight,
  ExternalLink,
  ChevronDown,
  Calendar,
  Users,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import { formatIsoId, getMonthLabel } from "@/lib/contract-lifecycle";

export function JatuhTempoDashboardSection({ dueData, now }) {
  const nowObj = React.useMemo(() => (now ? new Date(now) : new Date()), [now]);
  const currentY = nowObj.getFullYear();
  const currentM = nowObj.getMonth() + 1;
  const thisMonthKey = `${currentY}-${String(currentM).padStart(2, "0")}`;

  const nextMD = new Date(currentY, currentM, 1);
  const nextMonthKey = `${nextMD.getFullYear()}-${String(nextMD.getMonth() + 1).padStart(2, "0")}`;

  // Daftar 12 bulan ke depan
  const next12Months = React.useMemo(() => {
    const list = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(currentY, currentM - 1 + i, 1);
      const yyyyMm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = getMonthLabel(yyyyMm);
      list.push({
        bulan: yyyyMm,
        label,
        isCurrent: i === 0,
      });
    }
    return list;
  }, [currentY, currentM]);

  // Map data kelompok per bulan
  const groupsMap = React.useMemo(() => {
    const map = new Map();
    for (const g of dueData?.groups || []) {
      map.set(g.bulan, g.items);
    }
    return map;
  }, [dueData]);

  const lewatCount = dueData?.lewat?.length || 0;
  const hari7Count = dueData?.hari7?.length || 0;
  const hari30Count = dueData?.hari30?.length || 0;
  const bulanIniCount = dueData?.bulanIni?.length || 0;
  const bulanDepanCount = dueData?.bulanDepan?.length || 0;

  return (
    <section aria-labelledby="jatuh-tempo-heading" className="space-y-4">
      {/* Header Bagian */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-border/80 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <CalendarClock className="size-4" />
            </span>
            <h2 id="jatuh-tempo-heading" className="text-lg font-semibold tracking-tight text-text-1">
              Jatuh Tempo PKWT
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-text-2">
            Pemantauan kontrak kerja PKWT yang akan berakhir berdasarkan data Bank Data Karyawan.
          </p>
        </div>

        <Link
          href="/jatuh-tempo"
          className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-md bg-surface-2 px-3 py-1.5 text-xs font-medium text-text-1 hover:bg-surface-3 transition-colors border border-border"
        >
          <span>Buka Modul Jatuh Tempo Lengkap</span>
          <ArrowRight className="size-3.5 text-text-2" />
        </Link>
      </div>

      {/* 5 Kartu Ringkasan (Bisa diklik menuju /jatuh-tempo dengan filter sesuai) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* 1. Sudah Lewat & Belum Diperpanjang */}
        <Link
          href="/jatuh-tempo?filter=lewat"
          className="group relative flex flex-col rounded-lg border border-red-200 bg-red-50/60 p-3.5 transition-all hover:border-red-300 hover:shadow-sm dark:border-red-950/60 dark:bg-red-950/20"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-red-700 dark:text-red-400">
              Sudah Lewat
            </span>
            <AlertCircle className="size-3.5 text-red-500" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-red-800 dark:text-red-300">
            {lewatCount}
          </div>
          <span className="mt-1 text-[11px] text-red-700/80 dark:text-red-400/80 group-hover:underline">
            Belum diperpanjang →
          </span>
        </Link>

        {/* 2. ≤ 7 Hari */}
        <Link
          href="/jatuh-tempo?filter=hari7"
          className="group relative flex flex-col rounded-lg border border-amber-200 bg-amber-50/60 p-3.5 transition-all hover:border-amber-300 hover:shadow-sm dark:border-amber-950/60 dark:bg-amber-950/20"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              ≤ 7 Hari
            </span>
            <Clock className="size-3.5 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-amber-800 dark:text-amber-300">
            {hari7Count}
          </div>
          <span className="mt-1 text-[11px] text-amber-700/80 dark:text-amber-400/80 group-hover:underline">
            Mendesak diproses →
          </span>
        </Link>

        {/* 3. ≤ 30 Hari */}
        <Link
          href="/jatuh-tempo?filter=hari30"
          className="group relative flex flex-col rounded-lg border border-amber-200 bg-amber-50/60 p-3.5 transition-all hover:border-amber-300 hover:shadow-sm dark:border-amber-950/60 dark:bg-amber-950/20"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              ≤ 30 Hari
            </span>
            <AlertTriangle className="size-3.5 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-amber-800 dark:text-amber-300">
            {hari30Count}
          </div>
          <span className="mt-1 text-[11px] text-amber-700/80 dark:text-amber-400/80 group-hover:underline">
            Perlu disiapkan →
          </span>
        </Link>

        {/* 4. Bulan Ini */}
        <Link
          href={`/jatuh-tempo?bulan=${thisMonthKey}&belum=1`}
          className="group relative flex flex-col rounded-lg border border-primary/20 bg-primary/5 p-3.5 transition-all hover:border-primary/40 hover:shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
              Bulan Ini
            </span>
            <Calendar className="size-3.5 text-primary" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-text-1">
            {bulanIniCount}
          </div>
          <span className="mt-1 text-[11px] text-primary/80 group-hover:underline">
            {getMonthLabel(thisMonthKey)} →
          </span>
        </Link>

        {/* 5. Bulan Depan */}
        <Link
          href={`/jatuh-tempo?bulan=${nextMonthKey}&belum=1`}
          className="group relative flex flex-col rounded-lg border border-border bg-surface-1 p-3.5 transition-all hover:border-text-2/40 hover:shadow-sm col-span-2 sm:col-span-1"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-text-2">
              Bulan Depan
            </span>
            <Calendar className="size-3.5 text-text-2" />
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-text-1">
            {bulanDepanCount}
          </div>
          <span className="mt-1 text-[11px] text-text-2 group-hover:underline">
            {getMonthLabel(nextMonthKey)} →
          </span>
        </Link>
      </div>

      {/* Daftar Per Bulan untuk 12 Bulan ke Depan */}
      <div className="rounded-lg border border-border bg-surface-1 overflow-hidden">
        <div className="border-b border-border bg-surface-2 px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="size-4 text-text-2" />
            <h3 className="text-xs font-semibold text-text-1 uppercase tracking-wider">
              Jadwal Jatuh Tempo 12 Bulan ke Depan
            </h3>
          </div>
          <span className="text-[11px] text-text-2">
            Bulan berjalan terbuka otomatis
          </span>
        </div>

        <div className="divide-y divide-border">
          {next12Months.map((m) => {
            const items = groupsMap.get(m.bulan) || [];
            const count = items.length;
            const top5 = items.slice(0, 5);
            const remainingCount = count - top5.length;

            return (
              <details
                key={m.bulan}
                open={m.isCurrent}
                className="group select-none"
              >
                <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-xs font-medium text-text-1 hover:bg-surface-2 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <ChevronDown className="size-4 text-text-2 transition-transform duration-200 group-open:rotate-180" />
                    <span className="font-semibold text-sm">
                      {m.label}
                    </span>
                    {m.isCurrent && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                        Bulan Berjalan
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {count > 0 ? (
                      <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs font-semibold text-text-1">
                        {count} orang
                      </span>
                    ) : (
                      <span className="text-[11px] text-text-2">
                        0 orang
                      </span>
                    )}
                  </div>
                </summary>

                <div className="border-t border-border/60 bg-surface-0 px-4 py-3">
                  {count === 0 ? (
                    <div className="py-3 text-center text-xs text-text-2">
                      Tidak ada kontrak yang jatuh tempo pada bulan {m.label}.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-border/80 text-[11px] text-text-2">
                              <th className="pb-2 font-medium">Nama Karyawan</th>
                              <th className="pb-2 font-medium">Posisi / Lini</th>
                              <th className="pb-2 font-medium">Habis Kontrak</th>
                              <th className="pb-2 font-medium">Sisa Hari</th>
                              <th className="pb-2 text-right font-medium">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/40">
                            {top5.map((item) => {
                              const isExpired = item.sisa_hari < 0;
                              const isNear = item.sisa_hari >= 0 && item.sisa_hari <= 30;

                              return (
                                <tr key={item.id || item.nama_key} className="hover:bg-surface-2/40">
                                  <td className="py-2 pr-3">
                                    <div className="font-medium text-text-1">{item.nama_asli}</div>
                                    {item.nik_internal && item.nik_internal !== "-" && (
                                      <div className="font-mono text-[10px] text-text-2">
                                        NIK: {item.nik_internal}
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2 pr-3 text-text-2">
                                    <div>{item.posisi || "-"}</div>
                                    <div className="text-[10px] font-mono">{item.lini_bisnis || "-"}</div>
                                  </td>
                                  <td className="py-2 pr-3 text-text-1">
                                    <div className="font-medium">{item.tanggal_habis_id}</div>
                                    {item.selisih_dokumen && (
                                      <div className="text-[10px] text-amber-600 font-medium">
                                        Selisih Dokumen
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-2 pr-3">
                                    {isExpired ? (
                                      <span className="inline-flex rounded-full bg-red-100 dark:bg-red-950/60 px-2 py-0.5 text-[10px] font-bold text-red-700 dark:text-red-400">
                                        {item.sisa_hari} hari
                                      </span>
                                    ) : isNear ? (
                                      <span className="inline-flex rounded-full bg-amber-100 dark:bg-amber-950/60 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300">
                                        {item.sisa_hari} hari lagi
                                      </span>
                                    ) : (
                                      <span className="inline-flex rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:text-emerald-300">
                                        {item.sisa_hari} hari
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2 text-right">
                                    <Link
                                      href={`/jatuh-tempo?bulan=${m.bulan}&search=${encodeURIComponent(item.nama_asli)}`}
                                      className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary hover:bg-primary/20 transition-colors"
                                    >
                                      Proses
                                      <ArrowRight className="size-3" />
                                    </Link>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Tautan Lihat Semua */}
                      <div className="pt-2 flex items-center justify-between border-t border-border/50 text-xs">
                        <span className="text-[11px] text-text-2">
                          Menampilkan {top5.length} dari {count} karyawan jatuh tempo di bulan {m.label}
                        </span>
                        <Link
                          href={`/jatuh-tempo?bulan=${m.bulan}&belum=1`}
                          className="font-semibold text-primary hover:underline inline-flex items-center gap-1 text-xs"
                        >
                          Lihat semua ({count}) →
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      </div>
    </section>
  );
}
