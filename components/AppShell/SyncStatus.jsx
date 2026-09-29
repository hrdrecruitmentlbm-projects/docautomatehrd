"use client";

import Link from "next/link";
import { Database, TriangleAlert, CircleCheck, ChevronDown, CircleX } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { relativeTime } from "@/lib/sync-status";
import { cn } from "@/lib/utils";

/**
 * Pil status sinkronisasi.
 *
 * Prinsip: TIDAK APAKpun yang tampil saat semuanya beres. Kalau pil selalu
 * ada, ia jadi hiasan yang diabaikan; kalau ia muncul hanya saat ada
 * masalah, kemunculannya berarti sesuatu. Di mobile cukup berupa titik
 * berwarna — popover yang sama dibuka lewat ketukan.
 *
 * Label ikut menyebut SUMBER masalahnya. Versi sebelumnya memakai satu
 * level "terburuk" untuk master dan payroll, sehingga masalah payroll
 * muncul sebagai "Data belum ada" padahal master berisi 112 karyawan.
 * Dua masalah, dua tindakan berbeda, dua label berbeda.
 */

const LEVEL_STYLE = {
  gagal: {
    trigger: "bg-red-50 text-red-800 border-red-200",
    dot: "bg-red-600",
    icon: CircleX,
    label: "Gagal memuat",
  },
  kosong: {
    trigger: "bg-red-50 text-red-800 border-red-200",
    dot: "bg-red-600",
    icon: TriangleAlert,
    label: "Data kosong",
  },
  basi: {
    trigger: "bg-red-50 text-red-800 border-red-200",
    dot: "bg-red-600",
    icon: TriangleAlert,
    label: "Data basi",
  },
  perlu: {
    trigger: "bg-amber-50 text-amber-900 border-amber-200",
    dot: "bg-amber-600",
    icon: TriangleAlert,
    label: "Perlu sinkron",
  },
};

function Row({ label, value, sub, tone = "" }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="text-sm text-text-2">{label}</span>
      <span className="text-right">
        <span className={cn("block text-sm font-medium text-text-1", tone)}>{value}</span>
        {sub && <span className="block text-xs text-text-2">{sub}</span>}
      </span>
    </div>
  );
}

function levelTone(level) {
  return level === "ok" ? "" : level === "gagal" ? "text-red-700" : "text-amber-800";
}

export function SyncStatus({ sync }) {
  if (!sync) return null;

  // Semua beres -> jangan tampilkan apa pun.
  if (!sync.level) {
    return (
      <div className="hidden items-center xl:flex" title="Data master dan payroll sudah mutakhir">
        <span className="flex items-center gap-1.5 text-xs text-text-2">
          <CircleCheck className="size-3.5 text-emerald-600" aria-hidden="true" />
          Data mutakhir
        </span>
      </div>
    );
  }

  const style = LEVEL_STYLE[sync.level] || LEVEL_STYLE.perlu;
  const Icon = style.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-[13px] font-medium transition-colors",
          style.trigger
        )}
        aria-label={`Status sinkronisasi data: ${style.label}. Buka rincian.`}
      >
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        {/* Label penuh hanya di layar lebar; di bawah itu cukup ikon + titik. */}
        <span className="hidden lg:inline">{style.label}</span>
        <span className="lg:hidden" aria-hidden="true">
          <span className={cn("block size-2 rounded-full", style.dot)} />
        </span>
        <ChevronDown className="hidden size-3.5 shrink-0 opacity-70 lg:block" aria-hidden="true" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 shadow-popover">
        <DropdownMenuLabel className="text-text-1">Status Data</DropdownMenuLabel>

        <div className="px-2 pb-1">
          <Row
            label="Data master"
            value={
              sync.masterLevel === "gagal"
                ? "Gagal dimuat"
                : `${sync.master.count.toLocaleString("id-ID")} karyawan`
            }
            sub={
              sync.masterLevel === "gagal"
                ? sync.master.error
                : sync.master.lastSyncAt
                  ? `sinkron ${relativeTime(sync.master.lastSyncAt)}`
                  : "waktu sinkron tidak tercatat"
            }
            tone={levelTone(sync.masterLevel)}
          />
          <div className="border-t border-border" />
          <Row
            label="Payroll"
            value={
              sync.payrollLevel === "gagal"
                ? "Gagal dimuat"
                : sync.payroll.period
                  ? `periode ${sync.payroll.period}`
                  : `${sync.payroll.count.toLocaleString("id-ID")} karyawan`
            }
            sub={
              sync.payrollLevel === "gagal"
                ? sync.payroll.error
                : sync.payroll.lastSyncAt
                  ? `sinkron ${relativeTime(sync.payroll.lastSyncAt)}`
                  : "belum pernah sinkron"
            }
            tone={levelTone(sync.payrollLevel)}
          />
        </div>

        {sync.missingPayroll > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="px-2 py-1.5">
              <p className="text-sm font-medium text-amber-800">
                {sync.missingPayroll} karyawan belum punya payroll
              </p>
              <p className="mt-0.5 text-xs text-text-2">
                Kontrak untuk karyawan ini tidak bisa dibuat — komponen gaji akan
                kosong.
              </p>
            </div>
          </>
        )}

        <DropdownMenuSeparator />
        <div className="p-1">
          <Link
            href="/data"
            className="flex h-9 items-center justify-center gap-1.5 rounded-md text-sm font-medium text-primary transition-colors hover:bg-surface-2"
          >
            <Database className="size-4" aria-hidden="true" />
            Buka halaman Data
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
