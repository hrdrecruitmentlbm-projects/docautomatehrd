"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  CheckCircle2,
  FileDown,
  Loader2,
  Search,
  TriangleAlert,
  AlertTriangle,
  RotateCcw,
  ArrowRight,
  Check,
} from "lucide-react";
import { readJson } from "@/lib/http";
import { formatTanggalId } from "@/lib/pkwt";
import { useEmployeeSearch } from "@/lib/use-employee-search";
import { EmployeeSnapshot } from "@/components/documents/EmployeeSnapshot";
import { UnfilledMarksWarning } from "@/components/documents/UnfilledMarksWarning";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Paklaring (Surat Keterangan Kerja) — 2 langkah, bukan 3.
 *
 * PKWT punya langkah "Tanggal & Buat" dengan tiga field karena jangka waktu
 * harus dipilih. Paklaring tidak: satu tanggal sudah cukup, dan tanggal itu
 * punya dua nama dalam template — "sampai {{today}}" di badan surat dan
 * "Purwokerto, {{today}}" di blok tanda tangan. Dua istilah yang berbeda
 * membuat tanggal mengarang di satu tempat atau diverifikasi dua kali di
 * tempat lain. Jadi satu field, dua pakai, tidak mungkin berbeda.
 * Jadi satu field, dua pakai, MUSTAHIL berbeda.
 *
 * Default-nya hari ini karena itu kasus overwhelmingly yang benar (surat
 * terbit di hari terakhir bekerja). Field tetap ada: kalau surat keluar
 * terlambat, "sampai {{today}}" akan menyatakan karyawan masih bekerja sampai
 * hari ini — dan itu bisa bertabrakan dengan pekerjaan barunya.
 *
 * Kartu payroll sengaja disembunyikan: surat keterangan kerja tidak memuat
 * gaji. Menampilkannya membuat pengguna mengira ada data yang belum terisi.
 */
export function PaklaringAutoForm() {
  const {
    query,
    options,
    searching,
    searched,
    searchError,
    activeIdx,
    selectedKey,
    detail,
    loadingDetail,
    detailError,
    runSearch,
    onQueryChange,
    pickEmployee,
    onSearchKeyDown,
    reset,
  } = useEmployeeSearch();

  const [tanggalKeluar, setTanggalKeluar] = useState(todayISO());
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [submitError, setSubmitError] = useState(null);

  const emp = detail?.employee;
  const company = detail?.company;

  // Tanggal masuk master kosong = kalimat "telah bekerja dari tanggal ...
  // sampai ..." kehilangan ujungnya. Generator juga menolak, tapi Dicegat di
  // sini supaya pengguna tahu SEBELUM menekan tombol, bukan lewat galat 422.
  const missingMasuk = !emp?.tanggal_masuk;

  const currentStep = loadingDetail ? 2 : emp ? 2 : selectedKey ? 2 : 1;
  const stepState = (n) =>
    currentStep > n ? "done" : currentStep === n ? "current" : "future";

  const stepHeading = (n, label) => {
    const st = stepState(n);
    return (
      <h2
        id={`paklaring-step-${n}`}
        aria-current={st === "current" ? "step" : undefined}
        className="flex items-center gap-2.5 text-[15px] font-semibold"
      >
        <span
          className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            st === "done"
              ? "bg-primary text-primary-foreground"
              : st === "current"
                ? "bg-brand-wash text-brand-wash-ink"
                : "bg-surface-3 text-text-2"
          }`}
          aria-hidden="true"
        >
          {st === "done" ? <Check className="size-3.5" /> : n}
        </span>
        <span className={st === "future" ? "text-text-2" : "text-text-1"}>{label}</span>
      </h2>
    );
  };

  const validate = () => {
    const errs = {};
    if (!selectedKey || !emp) errs.karyawan = "Pilih karyawan dari hasil pencarian dulu";
    if (!tanggalKeluar) errs.tanggal_keluar = "Tanggal keluar wajib diisi, pilih tanggalnya";
    else if (missingMasuk) {
      errs.tanggal_keluar =
        "Tanggal masuk karyawan ini kosong di master, jadi periode bekerja tidak bisa tercetak. Lengkapi di sheet master lalu sync ulang.";
    }
    return errs;
  };

  const focusFirstError = (errs) => {
    const el = document.getElementById(
      errs.karyawan && !errs.tanggal_keluar ? "paklaring-search" : "tanggal_keluar"
    );
    el?.focus();
    el?.scrollIntoView({ block: "center" });
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    setSubmitAttempted(true);
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      focusFirstError(errs);
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    setResult(null);
    try {
      const response = await fetch("/api/generate-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: "paklaring",
          employeeKey: selectedKey,
          manual: { tanggal_keluar: tanggalKeluar },
        }),
      });
      const data = await readJson(response);
      if (!response.ok) throw new Error(data.error || "Terjadi kesalahan");
      setResult(data);
      toast.success(`Paklaring ${data.documentNumber} berhasil dibuat!`);
    } catch (error) {
      setSubmitError(error.message);
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const errorList = submitAttempted ? Object.entries(fieldErrors) : [];

  return (
    <div className="space-y-4">
      {result && (
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-brand-wash p-5 sm:p-6 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-brand-wash-ink">
              Paklaring berhasil dibuat
            </h2>
            <p className="mt-1 font-mono text-sm text-brand-wash-ink">
              {result.documentNumber}
            </p>

            {result.folderPath && (
              <p className="mt-1 text-xs text-brand-wash-ink/80">
                Diarsipkan di HRIS PKWT/{result.folderPath}
              </p>
            )}
            {result.folderNote && (
              <p className="mt-2 flex items-start gap-1.5 text-sm text-amber-700">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {result.folderNote}
              </p>
            )}

            {result.needsManualKop && (
              <p className="mt-2 flex items-start gap-1.5 text-sm text-amber-700">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                Lini bisnis ini belum punya KOP. Dokumen memakai template generik,
                buka lalu sisipkan gambar KOP secara manual.
              </p>
            )}
            {!result.needsManualKop && result.kopNote && (
              <p
                className={`mt-2 flex items-start gap-1.5 text-sm ${
                  result.kopInserted ? "text-brand-wash-ink" : "text-amber-700"
                }`}
              >
                {result.kopInserted ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                ) : (
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                )}
                {result.kopNote}
              </p>
            )}

            {/* TTD terpisah dari KOP karena sifatnya berbeda: nama &
                jabatan sudah hardcode di template, jadi gambar yang hilang
                hanya membuat surat kurang rapi, bukan dokumen rusak. */}
            {result.ttdNote && (
              <p
                className={`mt-2 flex items-start gap-1.5 text-sm ${
                  result.ttdInserted ? "text-brand-wash-ink" : "text-amber-700"
                }`}
              >
                {result.ttdInserted ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                ) : (
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                )}
                {result.ttdNote}
              </p>
            )}

            {/* Nilai kosong TIDAK tertangkap verifyDocument: penandanya
                hilang bersih dan dokumen terlihat rapi, padahal kalimatnya
                tidak lengkap. Lihat paklaringBlankFields(). */}
            {result.kosong?.length > 0 && (
              <div className="mt-3">
                <p className="flex items-start gap-1.5 text-sm text-amber-700">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  Data master kosong, jadi bagian ini tercetak kosong di surat:{" "}
                  <span className="font-medium">{result.kosong.join(", ")}</span>.{" "}
                  <Link href="/data" className="text-primary hover:underline">
                    Perbarui master
                  </Link>{" "}
                  lalu buat ulang.
                </p>
              </div>
            )}

            {result.unfilled?.length > 0 && (
              <div className="mt-3">
                <UnfilledMarksWarning marks={result.unfilled} docUrl={result.docUrl} />
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href={result.docUrl} target="_blank" rel="noreferrer">
              <Button className="h-10">
                <FileDown className="mr-2 size-4" aria-hidden="true" />
                Buka Dokumen
              </Button>
            </a>
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() => {
                setResult(null);
                reset();
                setSubmitAttempted(false);
                setFieldErrors({});
                setTanggalKeluar(todayISO());
              }}
            >
              <RotateCcw className="mr-2 size-4" aria-hidden="true" />
              Buat lagi
            </Button>
            <Link
              href="/input-dokumen"
              className="ml-1 inline-flex h-10 items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Lihat di Dokumen
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}

      <form
        onSubmit={onSubmit}
        className="space-y-8 rounded-lg border border-border bg-surface-1 p-5 sm:p-6"
      >
        {errorList.length > 1 && (
          <div role="alert" className="rounded-md border border-border bg-surface-2 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold text-text-1">
              <AlertTriangle className="size-4 text-red-600" aria-hidden="true" />
              Lengkapi {errorList.length} isian wajib
            </p>
            <ul className="mt-1.5 list-inside list-disc text-text-2">
              {errorList.map(([key, message]) => {
                const target = key === "karyawan" ? "paklaring-search" : key;
                return (
                  <li key={key}>
                    <a
                      href={`#${target}`}
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById(target)?.focus();
                      }}
                      className="text-text-1 underline underline-offset-2 hover:text-primary"
                    >
                      {message}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {submitError && (
          <div role="alert" className="rounded-md border border-border bg-surface-2 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold text-text-1">
              <AlertTriangle className="size-4 text-red-600" aria-hidden="true" />
              Gagal membuat Paklaring
            </p>
            <p className="mt-1 text-text-2">
              {submitError} Data Anda tetap tersimpan, tekan tombol buat untuk mencoba lagi.
            </p>
          </div>
        )}

        {/* Langkah 1: combobox karyawan */}
        <section aria-labelledby="paklaring-step-1" className="space-y-3">
          {stepHeading(1, "Pilih karyawan")}
          <div className="space-y-1.5">
            <Label htmlFor="paklaring-search">
              Cari karyawan (ketik nama){" "}
              <span className="text-red-600" aria-hidden="true">*</span>
              <span className="sr-only"> (wajib)</span>
            </Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-2"
                aria-hidden="true"
              />
              <Input
                id="paklaring-search"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder="cth: Citra Dewi Yuliani"
                className="h-10 pl-9"
                autoComplete="off"
                role="combobox"
                aria-expanded={options.length > 0}
                aria-controls="paklaring-listbox"
                aria-autocomplete="list"
                aria-activedescendant={
                  activeIdx >= 0 ? `paklaring-opt-${activeIdx}` : undefined
                }
                aria-describedby={
                  fieldErrors.karyawan ? "paklaring-err-karyawan" : "paklaring-search-hint"
                }
                aria-invalid={fieldErrors.karyawan ? true : undefined}
              />
            </div>
            <p id="paklaring-search-hint" className="text-xs text-text-2">
              Ketik minimal 2 huruf. Data dari master yang sudah di-sync di{" "}
              <Link href="/data" className="text-primary hover:underline">
                halaman Data
              </Link>
              .
            </p>
            {fieldErrors.karyawan && (
              <p id="paklaring-err-karyawan" className="text-xs text-red-700">
                {fieldErrors.karyawan}
              </p>
            )}

            {searching && (
              <div className="space-y-2" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-3 p-2.5">
                    <div className="skeleton size-7 rounded-full motion-reduce:animate-none" />
                    <div className="flex-1 space-y-1.5">
                      <div className="skeleton h-3.5 w-1/3 rounded motion-reduce:animate-none" />
                      <div className="skeleton h-3 w-1/2 rounded motion-reduce:animate-none" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {searchError && !searching && (
              <div role="alert" className="rounded-md border border-border bg-surface-2 p-3 text-sm">
                <p className="font-semibold text-text-1">Pencarian gagal</p>
                <p className="mt-0.5 text-text-2">{searchError}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 h-9"
                  onClick={() => query.trim().length >= 2 && runSearch(query.trim())}
                >
                  Coba lagi
                </Button>
              </div>
            )}

            {options.length > 0 && (
              <div
                role="listbox"
                id="paklaring-listbox"
                aria-label="Hasil pencarian karyawan"
                className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border"
              >
                {options.map((o, i) => (
                  <div
                    key={o.nama_key}
                    id={`paklaring-opt-${i}`}
                    role="option"
                    aria-selected={activeIdx === i}
                    onClick={() => pickEmployee(o.nama_key, o.nama_asli)}
                    onMouseEnter={() => setActiveIdx(i)}
                    className={`cursor-pointer px-4 py-2.5 transition-colors ${
                      activeIdx === i ? "bg-surface-2" : "hover:bg-surface-2"
                    }`}
                  >
                    <p className="text-sm font-semibold text-text-1">{o.nama_asli}</p>
                    <p className="text-xs text-text-2">
                      {[o.nik_internal, o.posisi, o.divisi, o.lini_bisnis]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {searched && !searching && options.length === 0 && !searchError && (
              <div className="rounded-md border border-dashed border-border p-3 text-sm">
                <p className="font-medium text-text-1">
                  Tidak ada hasil untuk &ldquo;{query.trim()}&rdquo;
                </p>
                <p className="mt-0.5 text-text-2">
                  Periksa ejaan, atau{" "}
                  <Link href="/data" className="text-primary hover:underline">
                    sync master dulu
                  </Link>{" "}
                  bila data karyawan belum masuk.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Langkah 2: verifikasi + tanggal + submit */}
        <section
          aria-labelledby="paklaring-step-2"
          className="space-y-4 border-t border-border pt-6"
        >
          {stepHeading(2, "Verifikasi data & tanggal keluar")}

          {loadingDetail && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2" aria-hidden="true">
              {[0, 1].map((i) => (
                <div key={i} className="skeleton h-[180px] rounded-md motion-reduce:animate-none" />
              ))}
            </div>
          )}

          {detailError && !loadingDetail && (
            <div role="alert" className="rounded-md border border-border bg-surface-2 p-3 text-sm">
              <p className="font-semibold text-text-1">Gagal memuat data karyawan</p>
              <p className="mt-0.5 text-text-2">
                {detailError}, pilih karyawan lagi untuk mengulang.
              </p>
            </div>
          )}

          {!selectedKey && !loadingDetail && !detailError && (
            <p className="text-sm text-text-2">
              Pilih karyawan untuk melihat data personal dan perusahaan yang akan
              terisi otomatis.
            </p>
          )}

          {emp && (
            <>
              <EmployeeSnapshot employee={emp} payroll={null} company={company} showPayroll={false} />

              {/* Tanggal masuk bukan field — dia isi {{TANGGAL MASUK}}. Kalau
                  kosong, kalimat periode bekerja tidak lengkap, jadi ini
                  ditulis sebagai peringatan (bukan error) di sebelah preview
                  tempat nilainya akan tercetak. */}
              <p
                className={`flex items-start gap-1.5 text-sm ${
                  missingMasuk ? "text-amber-700" : "text-text-2"
                }`}
              >
                {missingMasuk ? (
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                )}
                Tanggal masuk:{" "}
                <span className="font-medium text-text-1">
                  {missingMasuk ? "kosong di master" : formatTanggalId(emp.tanggal_masuk)}
                </span>
                {missingMasuk && (
                  <>
                    {" "}— periode bekerja tidak akan tercetak. Lengkapi di sheet master lalu{" "}
                    <Link href="/data" className="text-primary hover:underline">
                      sync
                    </Link>
                    .
                  </>
                )}
              </p>
            </>
          )}

          <div className="max-w-xs space-y-1.5 border-t border-border pt-4">
            <Label htmlFor="tanggal_keluar">
              Tanggal Keluar / Terakhir Bekerja{" "}
              <span className="text-red-600" aria-hidden="true">*</span>
              <span className="sr-only"> (wajib)</span>
            </Label>
            <Input
              id="tanggal_keluar"
              type="date"
              value={tanggalKeluar}
              onChange={(e) => {
                setTanggalKeluar(e.target.value);
                if (e.target.value) {
                  setFieldErrors((f) => ({ ...f, tanggal_keluar: undefined }));
                }
              }}
              onBlur={() => {
                if (!tanggalKeluar && submitAttempted) {
                  setFieldErrors((f) => ({
                    ...f,
                    tanggal_keluar: "Tanggal keluar wajib diisi, pilih tanggalnya",
                  }));
                }
              }}
              aria-invalid={fieldErrors.tanggal_keluar ? true : undefined}
              aria-describedby={fieldErrors.tanggal_keluar ? "paklaring-err-tanggal_keluar" : "paklaring-tanggal-hint"}
              className={`h-10 ${fieldErrors.tanggal_keluar ? "border-red-600" : ""}`}
            />
            <p id="paklaring-tanggal-hint" className="text-xs text-text-2">
              Dipakai dua kali di surat, jadi selalu sama: "sampai
              <span className="font-mono"> {"{{today}}"}</span>" di badan surat dan "Purwokerto,{" "}
              <span className="font-mono">{"{{today}}"}</span>". Arsip juga
              memakai bulan dari tanggal ini.
            </p>
            {fieldErrors.tanggal_keluar && (
              <p id="paklaring-err-tanggal_keluar" className="text-xs text-red-700">
                {fieldErrors.tanggal_keluar}
              </p>
            )}
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
            <Link
              href="/input-dokumen"
              className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface-1 px-4 text-sm font-medium text-text-1 transition-colors hover:bg-surface-2"
            >
              Batal
            </Link>
            <Button
              type="submit"
              disabled={isSubmitting || !selectedKey || !emp}
              aria-busy={isSubmitting}
              className="h-10 w-full min-w-[200px] sm:w-auto"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  Membuat Paklaring...
                </>
              ) : (
                "Buat Paklaring Sekarang"
              )}
            </Button>
          </div>
          {!emp && (
            <p className="text-right text-xs text-text-2">
              Pilih karyawan terlebih dahulu untuk mengaktifkan tombol.
            </p>
          )}
        </section>
      </form>
    </div>
  );
}
