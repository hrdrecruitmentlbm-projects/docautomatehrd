"use client";

import * as React from "react";
import Link from "next/link";
import {
  ExternalLink,
  FileText,
  Inbox,
  TriangleAlert,
  CalendarClock,
  UserPlus,
  Users,
  Wallet,
  ScanSearch,
} from "lucide-react";
import { BusinessLineChart, MonthlyTrendChart } from "@/components/DashboardCharts";
import { DocumentActions } from "@/components/documents/DocumentActions";
import { ContractStateDot } from "@/components/documents/DocumentStatus";
import { toIsoDate } from "@/lib/contract-lifecycle";

/**
 * Dashboard — KPI yang bisa ditindaklanjuti.
 *
 * YANG BERUBAH, dan alasannya:
 *   - "Rata² / Hari" dan "Pengguna Aktif" DIHAPUS. Keduanya dihitung dari
 *     500 baris terakhir (lihat catatan di page.jsx) dan tidak prompting
 *     keputusan apa pun. Digit yang tidak lengkap di atas kartu adalah
 *     masalah integritas data, bukan cuma metric yang sia-sia.
 *   - Diganti angka yang bisa ditindaklanjuti: kontrak yang mau habis,
 *     karyawan tanpa payroll, karyawan tanpa kontrak, dan progres bulan ini.
 *   - Donat komposisi jenis dokumen DIGANTI grafik batang per lini bisnis.
 *   - Tiap kartu adalah link ke tempat kerjanya.
 *
 * `now` datang dari server sebagai prop supaya render deterministik.
 */

const TYPE_TILES = {
  pkwt: "bg-emerald-100 text-emerald-700",
  sk: "bg-amber-100 text-amber-700",
  memo: "bg-slate-100 text-slate-700",
  sp: "bg-red-100 text-red-700",
};

const fmtInt = (n) => Number(n || 0).toLocaleString("id-ID");

const fmtDate = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "-";

function KpiCard({ label, value, context, href, icon: Icon, tone = "brand" }) {
  const tones = {
    brand: "bg-kpi-emerald",
    gold: "bg-kpi-gold",
    graphite: "bg-kpi-graphite",
    signal: "bg-kpi-signal",
  };
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-sm font-medium text-white">
        <Icon className="size-4 shrink-0 opacity-90" aria-hidden="true" />
        {label}
      </span>
      <span className="mt-3 block text-3xl font-semibold leading-none tabular text-white">
        {value}
      </span>
      <span className="mt-auto block pt-4 text-xs font-normal text-white/90">
        {context}
      </span>
    </>
  );

  return (
    <Link
      href={href}
      className={`flex min-h-[132px] flex-col rounded-lg p-5 transition-transform hover:brightness-110 active:translate-y-px ${tones[tone]}`}
    >
      {body}
    </Link>
  );
}

export function DashboardRevamp({ now, kpis, trend, byLine, recent, truncated }) {
  const [selectedLine, setSelectedLine] = React.useState(null);

  const visibleRecent = React.useMemo(() => {
    if (!selectedLine) return recent || [];
    return (recent || []).filter(
      (r) => (r.lini_bisnis || "Tanpa lini") === selectedLine
    );
  }, [recent, selectedLine]);

  return (
    <div className="space-y-5">
      {/* headerMode: "page" -> halaman ini memegang satu-satunya <h1>. */}
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold leading-7 tracking-[-0.01em] text-text-1">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-text-2">
            Yang perlu dikerjakan, bukan sekadar angka.
          </p>
        </div>
      </header>

      {/* KPI band — semua angka exact count dari server, tiap kartu navigating. */}
      <section aria-label="Yang perlu ditangani" className="space-y-2">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Segera Berakhir"
            value={fmtInt(kpis.expiring)}
            context="kontrak habis dalam 30 hari"
            href="/kontrak"
            icon={CalendarClock}
            tone={kpis.expiring > 0 ? "signal" : "brand"}
          />
          <KpiCard
            label="Belum Ada Kontrak"
            value={fmtInt(kpis.noContract)}
            context={`dari ${fmtInt(kpis.employees)} karyawan di master`}
            href="/kontrak?state=belum"
            icon={UserPlus}
            tone={kpis.noContract > 0 ? "gold" : "brand"}
          />
          <KpiCard
            label="Payroll Belum Ada"
            value={fmtInt(kpis.missingPayroll)}
            context="kontrak mereka akan gagal dibuat"
            href="/data"
            icon={Wallet}
            tone={kpis.missingPayroll > 0 ? "signal" : "brand"}
          />
          <KpiCard
            label="Dokumen Bulan Ini"
            value={fmtInt(kpis.monthTotal)}
            context={`${fmtInt(kpis.monthMine)} dibuat oleh Anda`}
            href="/history"
            icon={FileText}
            tone="graphite"
          />
        </div>
        {truncated && (
          <p className="text-right text-xs text-text-2">
            Dihitung dari 5.000 log terbaru. Naikkan KEY_CAP bila perlu angka
            pastwaan untuk seluruh riwayat.
          </p>
        )}
      </section>

      {/* Charts: tren bulanan | per lini bisnis */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section
          aria-labelledby="tren-heading"
          className="rounded-lg border border-border bg-surface-1 p-5"
        >
          <h2 id="tren-heading" className="mb-3 text-[15px] font-semibold text-text-1">
            Dokumen per Bulan
          </h2>
          <MonthlyTrendChart data={trend} />
        </section>

        <section
          aria-labelledby="lini-heading"
          className="rounded-lg border border-border bg-surface-1 p-5"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 id="lini-heading" className="text-[15px] font-semibold text-text-1">
              Dokumen per Lini Bisnis
            </h2>
            {selectedLine && (
              <button
                type="button"
                onClick={() => setSelectedLine(null)}
                className="rounded-md border border-border px-2 py-1 text-xs tabular text-text-2 transition-colors hover:bg-surface-2"
              >
                {selectedLine} ×
              </button>
            )}
          </div>
          <BusinessLineChart
            data={byLine}
            selected={selectedLine}
            onSelect={(name) => setSelectedLine((cur) => (cur === name ? null : name))}
          />
          <p className="mt-2 text-right text-xs text-text-2">
            Klik batang untuk menyaring tabel di bawah
          </p>
        </section>
      </div>

      {/* Recent documents */}
      <section
        aria-labelledby="recent-heading"
        className="overflow-hidden rounded-lg border border-border bg-surface-1"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <h2 id="recent-heading" className="text-[15px] font-semibold text-text-1">
            Dokumen Terbaru
            {selectedLine && (
              <span className="ml-2 text-xs font-normal text-text-2">
                difilter: {selectedLine}
              </span>
            )}
          </h2>
          <Link href="/input-dokumen" className="text-sm font-medium text-primary hover:underline">
            Lihat semua
          </Link>
        </div>

        {(recent || []).length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-surface-2">
              <Inbox className="size-6 text-text-2" aria-hidden="true" />
            </div>
            <h3 className="mb-1 text-sm font-semibold text-text-1">Belum ada dokumen</h3>
            <p className="mb-5 max-w-sm text-sm text-text-2">
              Sync master di halaman Data lalu buat kontrak pertama dari Register.
            </p>
            <Link
              href="/kontrak"
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Users className="mr-1.5 size-4" aria-hidden="true" />
              Buka Register Kontrak
            </Link>
          </div>
        ) : visibleRecent.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <p className="text-sm text-text-2">
              Tidak ada dokumen terbaru di lini bisnis ini.
            </p>
            <button
              type="button"
              onClick={() => setSelectedLine(null)}
              className="mt-3 inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium text-text-1 transition-colors hover:bg-surface-2"
            >
              Hapus filter
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                {visibleRecent.length} dokumen terbaru beserta nama, nomor, jenis,
                tanggal, dan status masanya.
              </caption>
              <thead>
                <tr className="border-y border-border text-xs font-medium text-text-2">
                  <th scope="col" className="px-5 py-2.5 text-left">Nama</th>
                  <th scope="col" className="hidden px-4 py-2.5 text-left lg:table-cell">
                    Nomor
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-left">Jenis</th>
                  <th scope="col" className="px-4 py-2.5 text-left">Tanggal</th>
                  <th scope="col" className="hidden px-4 py-2.5 text-left md:table-cell">
                    Kontrak
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {visibleRecent.map((log) => {
                  const type = (log.document_type || "").toLowerCase();
                  const tile = TYPE_TILES[type] || "bg-surface-3 text-text-2";
                  return (
                    <tr
                      key={log.id}
                      className="border-b border-row-border transition-colors last:border-b-0 hover:bg-surface-0"
                    >
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-3">
                          <span
                            className={`flex size-7 shrink-0 items-center justify-center rounded-md ${tile}`}
                            aria-hidden="true"
                          >
                            <FileText className="size-4" />
                          </span>
                          <span className="min-w-0">
                            <Link
                              href={`/input-dokumen/${log.id}`}
                              className="block truncate font-medium text-text-1 hover:text-primary hover:underline"
                            >
                              {log.employee_name || "Dokumen"}
                            </Link>
                            {log.unfilled_marks?.length > 0 && (
                              <span className="flex items-center gap-1 text-xs text-amber-700">
                                <ScanSearch className="size-3 shrink-0" aria-hidden="true" />
                                {log.unfilled_marks.length} penanda belum terisi
                              </span>
                            )}
                            <span className="block truncate text-xs text-text-2 md:hidden">
                              {log.document_type?.toUpperCase()} · {fmtDate(log.created_at)}
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
                          className={`inline-flex h-5 items-center rounded-full px-2 text-xs font-medium ${tile}`}
                        >
                          {log.document_type?.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 tabular text-text-2">
                        <time dateTime={log.created_at}>{fmtDate(log.created_at)}</time>
                      </td>
                      <td className="hidden px-4 py-2.5 md:table-cell">
                        {type === "pkwt" ? (
                          <ContractStateDot
                            tanggalBerakhir={toIsoDate(log.tanggal_berakhir)}
                            now={now}
                          />
                        ) : (
                          <span className="text-xs text-text-2">-</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
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

      {kpis.expired > 0 && (
        <p className="flex items-start gap-2 rounded-md border border-border bg-surface-2 px-4 py-3 text-sm text-text-2">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
          <span>
            Ada <span className="font-semibold text-text-1">{fmtInt(kpis.expired)}</span>{" "}
            kontrak yang sudah lewat masa berlakunya. Buka{" "}
            <Link href="/kontrak?state=kedaluwarsa" className="font-medium text-primary hover:underline">
              Register Kontrak
            </Link>{" "}
            untuk memperpanjang.
          </span>
        </p>
      )}
    </div>
  );
}
