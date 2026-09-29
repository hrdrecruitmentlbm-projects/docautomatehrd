"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Play,
  RotateCcw,
  Loader2,
  Check,
  X,
  Clock,
  FileText,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatRp, formatTanggalId, addMonths } from "@/lib/pkwt";
import { cn } from "@/lib/utils";

/**
 * Pembuatan massal PKWT.
 *
 * DIORCHESTRASI DARI KLIEN, BUKAN ANTRIAN DI SERVER — disengaja.
 * Satu kontrak ≈ 4-6 panggilan Google API, dan batas durasi fungsi
 * serverless di sini 60 detik (lihat sync-master). 30 kontrak sudah
 * melewatinya. Tapi antrian durable (Inngest/QStash) adalah infrastruktur
 * dan permukaan operasional baru untuk tugas yang realistis 10-40
 * dokumen, dipakai beberapa kali setahun. Kalau suatu saat memang butuh
 * 200+ dokumen dalam satu jalan, barulah pindah ke antrian.
 *
 * Yang didapat dari orkestrasi klien tanpa tambahan apa pun:
 *   - progres per baris, gratis
 *   - ulangi hanya yang gagal, gratis
 *   - lanjut setelah refresh, gratis (antrian disimpan di sessionStorage)
 *
 * Konkuren 2: cukup untuk bergerak, dan tidak memicu rate limit Google.
 */

const CONCURRENCY = 2;
const TERM_OPTIONS = [1, 3, 6, 12, 24];
const QUEUE_KEY = "docauto-bulk-queue";

const STATE = {
  menunggu: { label: "Menunggu", className: "bg-surface-2 text-text-2", icon: Clock },
  diproses: { label: "Diproses", className: "bg-blue-100 text-blue-700", icon: Loader2 },
  berhasil: { label: "Berhasil", className: "bg-emerald-100 text-emerald-700", icon: Check },
  gagal: { label: "Gagal", className: "bg-red-100 text-red-700", icon: X },
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Baca antrian yang tersimpan dari sesi sebelumnya. Dipakai sebagai
 * lazy initializer (bukan effect) supaya tidak ada setState setelah render
 * pertama — dan karena sessionStorage memang sudah ada sebelum mount.
 */
function readSavedQueue(keysParam) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(QUEUE_KEY) || "null");
    if (saved && Array.isArray(saved.rows) && saved.keys === keysParam) {
      return saved.rows;
    }
  } catch {
    /* abaikan antrian rusak */
  }
  return null;
}

export default function BulkGenerator() {
  const router = useRouter();
  const params = useSearchParams();
  const keysParam = params.get("keys") || "";

  const [rows, setRows] = React.useState(() => readSavedQueue(keysParam) || []);
  const [loading, setLoading] = React.useState(() => !readSavedQueue(keysParam));
  const [loadError, setLoadError] = React.useState(null);
  const [start, setStart] = React.useState(todayISO());
  const [term, setTerm] = React.useState(12);
  const [overrideOn, setOverrideOn] = React.useState(false);
  const [override, setOverride] = React.useState({});
  const [running, setRunning] = React.useState(false);

  const keys = React.useMemo(
    () => keysParam.split(",").map((s) => s.trim()).filter(Boolean),
    [keysParam]
  );

  // Muat detail karyawan terpilih. no_ktp ikut diambil karena form ini memang
  // akan menghasilkan kontrak — sama seperti langkah "Verifikasi data" di form
  // PKWT biasa. SetState hanya di dalam callback async, bukan di body effect.
  React.useEffect(() => {
    if (keys.length === 0) return undefined;

    let cancelled = false;
    (async () => {
      try {
        const out = [];
        // .in() dibatasi 100 key per permintaan agar URL tidak meledak.
        for (let i = 0; i < keys.length; i += 100) {
          const chunk = keys.slice(i, i + 100);
          const res = await fetch(
            `/api/register/employees?keys=${encodeURIComponent(chunk.join(","))}`
          );
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Gagal memuat data karyawan");
          out.push(...(data.employees || []));
        }
        if (cancelled) return;
        setRows(
          out.map((e) => ({
            key: e.nama_key,
            nama: e.nama_asli,
            posisi: e.posisi,
            divisi: e.divisi,
            lini_bisnis: e.lini_bisnis,
            hasPayroll: !!e.has_payroll,
            payrollPeriode: e.payroll_periode || null,
            gapok: e.gapok || 0,
            state: "menunggu",
            documentNumber: null,
            docId: null,
            error: null,
            unfilled: [],
          }))
        );
      } catch (e) {
        if (!cancelled) setLoadError(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [keys]);

  const persist = React.useCallback(
    (next) => {
      try {
        sessionStorage.setItem(QUEUE_KEY, JSON.stringify({ keys: keysParam, rows: next }));
      } catch {
        /* storage penuh atau diblokir — bukan kondisi fatal */
      }
    },
    [keysParam]
  );

  const patchRow = React.useCallback(
    (key, patch) => {
      setRows((prev) => {
        const next = prev.map((r) => (r.key === key ? { ...r, ...patch } : r));
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const generateOne = async (row) => {
    const rowStart = override[row.key]?.start || start;
    const rowTerm = override[row.key]?.term || term;
    const end = addMonths(new Date(rowStart), rowTerm).toISOString().slice(0, 10);

    const res = await fetch("/api/generate-document", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        documentType: "pkwt",
        employeeKey: row.key,
        manual: {
          tanggal_mulai: rowStart,
          jangka_bulan: rowTerm,
          tanggal_berakhir: end,
          periode_kontrak: `${rowTerm} Bulan`,
          tanggal_ttd: todayISO(),
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Gagal membuat dokumen");
    return data;
  };

  const runQueue = async (targets) => {
    setRunning(true);
    const queue = [...targets];
    const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (queue.length) {
        const row = queue.shift();
        if (!row) return;
        patchRow(row.key, { state: "diproses", error: null });
        try {
          const data = await generateOne(row);
          patchRow(row.key, {
            state: "berhasil",
            documentNumber: data.documentNumber,
            docId: data.docId,
            unfilled: data.unfilled || [],
          });
        } catch (e) {
          patchRow(row.key, { state: "gagal", error: e.message });
        }
      }
    });
    await Promise.all(workers);
    setRunning(false);
  };

  const pending = rows.filter((r) => r.state === "menunggu");
  const failed = rows.filter((r) => r.state === "gagal");
  const done = rows.filter((r) => r.state === "berhasil");
  const blocked = rows.filter((r) => !r.hasPayroll);

  const startAll = async () => {
    if (blocked.length > 0) {
      const ok = window.confirm(
        `${blocked.length} karyawan tidak punya payroll. Kontrak untuk mereka akan gagal dibuat karena komponen gaji tidak bisa terisi.\n\nLanjutkan saja?`
      );
      if (!ok) return;
    }
    await runQueue(pending);
  };

  if (keys.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface-1 px-6 py-14 text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-surface-2">
          <FileText className="size-6 text-text-2" aria-hidden="true" />
        </div>
        <h2 className="mb-1 text-sm font-semibold text-text-1">Tidak ada karyawan dipilih</h2>
        <p className="mb-5 max-w-sm text-sm text-text-2">
          Pilih karyawan di Register Kontrak, lalu tekan &ldquo;Buat untuk
          terpilih&rdquo;.
        </p>
        <Link
          href="/kontrak"
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Buka Register Kontrak
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-surface-1 p-6">
        <div className="skeleton h-5 w-48 rounded motion-reduce:animate-none" aria-hidden="true" />
        <div className="mt-3 skeleton h-3.5 w-72 rounded motion-reduce:animate-none" aria-hidden="true" />
        <p className="sr-only" role="status">Memuat data karyawan...</p>
      </div>
    );
  }

  if (loadError) {
    return (
      <div role="alert" className="rounded-lg border border-border bg-surface-1 p-6">
        <p className="font-semibold text-text-1">Gagal memuat data karyawan</p>
        <p className="mt-1 text-sm text-text-2">{loadError}</p>
        <Button variant="outline" className="mt-4 h-9" onClick={() => router.refresh()}>
          Coba lagi
        </Button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface-1 px-6 py-14 text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-surface-2">
          <FileText className="size-6 text-text-2" aria-hidden="true" />
        </div>
        <h2 className="mb-1 text-sm font-semibold text-text-1">Karyawan tidak ditemukan</h2>
        <p className="mb-5 max-w-sm text-sm text-text-2">
          {keys.length} karyawan dipilih tapi tidak ada di master. Sync master
          dulu di halaman Data.
        </p>
        <Link
          href="/kontrak"
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Kembali ke Register
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Syarat kontrak: berlaku untuk semua, dengan pengecualian per karyawan */}
      <section className="rounded-lg border border-border bg-surface-1 p-5">
        <h2 className="text-[15px] font-semibold text-text-1">Syarat Kontrak</h2>
        <p className="mt-1 text-sm text-text-2">
          Berlaku untuk semua karyawan terpilih. Ini yang diulang-ulang kalau
          dibuat manual satu per satu.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="bulk-start">Tanggal mulai</Label>
            <Input
              id="bulk-start"
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className="h-10 w-[180px]"
            />
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium text-text-1">Jangka waktu</legend>
            <div className="flex flex-wrap gap-1.5">
              {TERM_OPTIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setTerm(m)}
                  aria-pressed={term === m}
                  className={cn(
                    "h-10 rounded-md border px-3 text-sm font-medium transition-colors",
                    term === m
                      ? "border-transparent bg-primary text-primary-foreground"
                      : "border-border bg-surface-1 text-text-1 hover:bg-surface-2"
                  )}
                >
                  {m} Bulan
                </button>
              ))}
            </div>
          </fieldset>

          <p className="pb-2.5 text-sm text-text-2">
            Berakhir <span className="font-semibold text-text-1">
              {formatTanggalId(addMonths(new Date(start), term).toISOString().slice(0, 10))}
            </span>
          </p>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm text-text-1">
          <input
            type="checkbox"
            checked={overrideOn}
            onChange={(e) => {
              setOverrideOn(e.target.checked);
              setOverride(e.target.checked ? { [rows[0].key]: {} } : {});
            }}
            className="size-4 rounded border-border"
          />
          Atur tanggal per karyawan (biarkan kosong bila semua sama)
        </label>
      </section>

      {/* Preflight: payroll kosong dan template akan menggagalkan semua */}
      {blocked.length > 0 && (
        <div role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold text-amber-900">
            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
            {blocked.length} karyawan belum punya payroll
          </p>
          <p className="mt-1 text-amber-800">
            Kontrak untuk mereka akan berhenti dengan pesan &ldquo;payroll
            belum ada&rdquo;, bukan membuat dokumen bergaji kosong. Sync payroll
            dulu di halaman Data untuk hasil yang bersih.
          </p>
        </div>
      )}

      {/* Antrean */}
      <section className="overflow-hidden rounded-lg border border-border bg-surface-1">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <h2 className="text-[15px] font-semibold text-text-1">
            Antrean ({rows.length} dokumen)
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {failed.length > 0 && !running && (
              <Button
                variant="outline"
                className="h-9"
                onClick={() => runQueue(failed)}
              >
                <RotateCcw className="mr-2 size-4" aria-hidden="true" />
                Ulangi yang gagal ({failed.length})
              </Button>
            )}
            <Button
              className="h-9"
              onClick={startAll}
              disabled={running || pending.length === 0}
              aria-busy={running}
            >
              {running ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                  Sedang membuat...
                </>
              ) : (
                <>
                  <Play className="mr-2 size-4" aria-hidden="true" />
                  Buat {pending.length} dokumen
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Determinate progress — pair bar with text so the value is never
            colour-only (pola yang sama dengan SheetsSync). */}
        {rows.length > 0 && (
          <div className="border-b border-border px-5 py-3">
            <div
              role="progressbar"
              aria-label="Progres pembuatan dokumen"
              aria-valuemin={0}
              aria-valuemax={rows.length}
              aria-valuenow={done.length + failed.length}
              className="h-2 w-full overflow-hidden rounded-full bg-surface-3"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
                style={{
                  width: `${Math.round(((done.length + failed.length) / rows.length) * 100)}%`,
                }}
              />
            </div>
            <p className="mt-1.5 text-xs text-text-2" role="status">
              {done.length + failed.length} dari {rows.length} selesai
              {done.length > 0 && ` · ${done.length} berhasil`}
              {failed.length > 0 && ` · ${failed.length} gagal`}
              {running && ` · sedang berjalan`}
            </p>
          </div>
        )}

        <ul className="divide-y divide-border">
          {rows.map((r) => {
            const meta = STATE[r.state] || STATE.menunggu;
            const Icon = meta.icon;
            const ov = override[r.key];
            return (
              <li key={r.key} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span
                  className={cn(
                    "inline-flex h-5 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium",
                    meta.className
                  )}
                >
                  <Icon
                    className={cn("size-3", r.state === "diproses" && "animate-spin")}
                    aria-hidden="true"
                  />
                  {meta.label}
                </span>

                <span className="min-w-[160px] flex-1">
                  <span className="block truncate text-sm font-medium text-text-1">
                    {r.nama}
                  </span>
                  <span className="block truncate text-xs text-text-2">
                    {[r.posisi, r.lini_bisnis].filter(Boolean).join(" · ") || "-"}
                    {r.gapok > 0 ? ` · ${formatRp(r.gapok)}` : ""}
                  </span>
                </span>

                {r.state === "berhasil" && r.documentNumber && (
                  <span className="min-w-0">
                    <Link
                      href={`/input-dokumen/${r.docId}`}
                      className="block max-w-[220px] truncate font-mono text-xs text-primary hover:underline"
                    >
                      {r.documentNumber}
                    </Link>
                    {r.unfilled?.length > 0 && (
                      <span className="block text-xs text-amber-700">
                        {r.unfilled.length} penanda belum terisi
                      </span>
                    )}
                  </span>
                )}

                {r.state === "gagal" && r.error && (
                  <span className="min-w-0 max-w-[280px]">
                    <span className="block truncate text-xs text-red-700">{r.error}</span>
                  </span>
                )}

                {ov && r.state === "menunggu" && (
                  <span className="flex items-center gap-1.5">
                    <input
                      type="date"
                      value={ov.start || start}
                      onChange={(e) =>
                        setOverride((p) => ({
                          ...p,
                          [r.key]: { ...p[r.key], start: e.target.value },
                        }))
                      }
                      aria-label={`Tanggal mulai untuk ${r.nama}`}
                      className="h-8 rounded-md border border-border bg-surface-1 px-2 text-xs"
                    />
                    <select
                      value={String(ov.term || term)}
                      onChange={(e) =>
                        setOverride((p) => ({
                          ...p,
                          [r.key]: { ...p[r.key], term: Number(e.target.value) },
                        }))
                      }
                      aria-label={`Jangka waktu untuk ${r.nama}`}
                      className="h-8 rounded-md border border-border bg-surface-1 px-2 text-xs"
                    >
                      {TERM_OPTIONS.map((m) => (
                        <option key={m} value={m}>{m} bln</option>
                      ))}
                    </select>
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        {done.length === rows.length && done.length > 0 && (
          <div className="border-t border-border bg-brand-wash px-5 py-4">
            <p className="text-sm font-semibold text-brand-wash-ink">
              Semua {done.length} dokumen selesai dibuat
            </p>
            <p className="mt-1 text-sm text-brand-wash-ink/90">
              Semuanya tersimpan di folder arsip bulan ini. Cek satu per satu
              bila ada yang ditandai penanda belum terisi.
            </p>
            <Link
              href="/input-dokumen"
              className="mt-3 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Lihat semua dokumen
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
