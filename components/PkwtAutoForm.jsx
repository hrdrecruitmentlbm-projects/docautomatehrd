"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, FileDown, Loader2, Search, TriangleAlert, AlertTriangle, RotateCcw, ArrowRight, Check } from "lucide-react";
import { formatRp, formatTanggalId, addMonths } from "@/lib/pkwt";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * PKWT auto form: 3 real steps (Pilih karyawan -> Verifikasi data ->
 * Tanggal & Buat). Step headings double as the stepper (aria-current).
 * Employee search is a full combobox (roles, arrows/Enter/Esc,
 * aria-activedescendant), debounced 300ms with AbortController so stale
 * responses never land. Validation is inline + focus-first + summary;
 * ZERO validation toasts. Submit stays disabled until the detail preview
 * has loaded (a legal document must never generate from a half-loaded
 * selection).
 */
export function PkwtAutoForm() {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [selectedKey, setSelectedKey] = useState("");
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState(null);

  const [tanggalMulai, setTanggalMulai] = useState(todayISO());
  const [jangkaBulan, setJangkaBulan] = useState("12");
  const [tanggalTtd, setTanggalTtd] = useState(todayISO());

  const [fieldErrors, setFieldErrors] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const debounceRef = useRef(null);
  const abortRef = useRef(null);

  const runSearch = async (term) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(`/api/employees?q=${encodeURIComponent(term)}&limit=10`, {
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mencari karyawan");
      setOptions(data.employees || []);
      setActiveIdx(-1);
      setSearched(true);
    } catch (e) {
      if (e.name === "AbortError") return;
      // Search failure is an inline state with retry, not a toast.
      setSearchError(e.message);
      setOptions([]);
      setSearched(true);
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  };

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    debounceRef.current = setTimeout(() => runSearch(term), 300);
    return () => {
      clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, [query]);

  const onQueryChange = (value) => {
    setQuery(value);
    setSelectedKey("");
    setDetail(null);
    setDetailError(null);
    if (value.trim().length < 2) {
      clearTimeout(debounceRef.current);
      abortRef.current?.abort();
      setOptions([]);
      setSearching(false);
      setSearched(false);
      setSearchError(null);
      setActiveIdx(-1);
    } else {
      // Drop stale options immediately; skeleton covers the debounce gap.
      setOptions([]);
      setActiveIdx(-1);
      setSearched(false);
    }
  };

  const pickEmployee = async (key, nama) => {
    setSelectedKey(key);
    setQuery(nama);
    setOptions([]);
    setActiveIdx(-1);
    setSearched(false);
    setDetail(null);
    setDetailError(null);
    setResult(null);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/employee-detail?key=${encodeURIComponent(key)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat data karyawan");
      setDetail(data);
    } catch (e) {
      setDetailError(e.message);
    } finally {
      setLoadingDetail(false);
    }
  };

  // Combobox keyboard: arrows move, Enter picks, Esc closes.
  const onSearchKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIdx >= 0 && options[activeIdx]) {
      e.preventDefault();
      pickEmployee(options[activeIdx].nama_key, options[activeIdx].nama_asli);
    } else if (e.key === "Escape") {
      setOptions([]);
      setActiveIdx(-1);
    }
  };

  const tanggalBerakhirISO = useMemo(() => {
    const n = parseInt(jangkaBulan, 10);
    if (!tanggalMulai || !n) return "";
    return addMonths(new Date(tanggalMulai), n).toISOString().slice(0, 10);
  }, [tanggalMulai, jangkaBulan]);

  const validate = () => {
    const errs = {};
    if (!selectedKey || !emp) errs.karyawan = "Pilih karyawan dari hasil pencarian dulu";
    if (!tanggalMulai) errs.tanggal_mulai = "Tanggal Mulai Kontrak wajib diisi, pilih tanggalnya";
    return errs;
  };

  const focusFirstError = (errs) => {
    const el = document.getElementById(errs.karyawan && !errs.tanggal_mulai ? "pkwt-search" : "tanggal_mulai");
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
          documentType: "pkwt",
          employeeKey: selectedKey,
          manual: {
            tanggal_mulai: tanggalMulai,
            jangka_bulan: jangkaBulan,
            periode_kontrak: jangkaBulan ? `${jangkaBulan} Bulan` : "",
            tanggal_berakhir: tanggalBerakhirISO,
            tanggal_ttd: tanggalTtd,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Terjadi kesalahan");
      setResult(data);
      toast.success(`PKWT ${data.documentNumber} berhasil dibuat!`);
    } catch (error) {
      setSubmitError(error.message);
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const emp = detail?.employee;
  const pay = detail?.payroll;
  const company = detail?.company;

  // Real sequence, so numbered step headings earn their place.
  const currentStep = loadingDetail ? 2 : emp ? 3 : selectedKey ? 2 : 1;
  const stepState = (n) =>
    currentStep > n ? "done" : currentStep === n ? "current" : "future";

  const stepHeading = (n, label) => {
    const st = stepState(n);
    return (
      <h2
        id={`pkwt-step-${n}`}
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

  const errorList = submitAttempted ? Object.entries(fieldErrors) : [];

  return (
    <div className="space-y-4">
      {/* Success: brand wash, ONE primary, secondary reset, tertiary link */}
      {result && (
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-brand-wash p-5 sm:p-6 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-brand-wash-ink">
              PKWT berhasil dibuat
            </h2>
            <p className="mt-1 font-mono text-sm text-brand-wash-ink">
              {result.documentNumber}
            </p>
            {result.needsManualKop && (
              <p className="mt-2 flex items-start gap-1.5 text-sm text-amber-700">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                Lini bisnis ini belum punya KOP. Dokumen memakai template
                generik, buka lalu sisipkan gambar KOP secara manual.
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
                setSelectedKey("");
                setQuery("");
                setDetail(null);
                setSubmitAttempted(false);
                setFieldErrors({});
                setTanggalMulai(todayISO());
                setTanggalTtd(todayISO());
                setJangkaBulan("12");
              }}
            >
              <RotateCcw className="mr-2 size-4" aria-hidden="true" />
              Buat lagi
            </Button>
            <Link
              href="/history"
              className="ml-1 inline-flex h-10 items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              Lihat di Riwayat
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      )}

      <form
        onSubmit={onSubmit}
        className="space-y-8 rounded-lg border border-border bg-surface-1 p-5 sm:p-6"
      >
        {/* Error summary: >1 error gets anchor links (focus targets) */}
        {errorList.length > 1 && (
          <div role="alert" className="rounded-md border border-border bg-surface-2 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold text-text-1">
              <AlertTriangle className="size-4 text-red-600" aria-hidden="true" />
              Lengkapi {errorList.length} isian wajib
            </p>
            <ul className="mt-1.5 list-inside list-disc text-text-2">
              {errorList.map(([key, message]) => {
                const target = key === "karyawan" ? "pkwt-search" : key;
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

        {/* Submit failure: persistent inline recovery, inputs preserved */}
        {submitError && (
          <div role="alert" className="rounded-md border border-border bg-surface-2 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold text-text-1">
              <AlertTriangle className="size-4 text-red-600" aria-hidden="true" />
              Gagal membuat PKWT
            </p>
            <p className="mt-1 text-text-2">
              {submitError} Data Anda tetap tersimpan, tekan tombol buat untuk
              mencoba lagi.
            </p>
          </div>
        )}

        {/* Step 1: combobox */}
        <section aria-labelledby="pkwt-step-1" className="space-y-3">
          {stepHeading(1, "Pilih karyawan")}
          <div className="space-y-1.5">
            <Label htmlFor="pkwt-search">
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
                id="pkwt-search"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder="cth: Citra Dewi Yuliani"
                className="h-10 pl-9"
                autoComplete="off"
                role="combobox"
                aria-expanded={options.length > 0}
                aria-controls="pkwt-listbox"
                aria-autocomplete="list"
                aria-activedescendant={
                  activeIdx >= 0 ? `pkwt-opt-${activeIdx}` : undefined
                }
                aria-describedby={
                  fieldErrors.karyawan ? "err-karyawan" : "pkwt-search-hint"
                }
                aria-invalid={fieldErrors.karyawan ? true : undefined}
              />
            </div>
            <p id="pkwt-search-hint" className="text-xs text-text-2">
              Ketik minimal 2 huruf. Data dari master yang sudah di-sync di{" "}
              <Link href="/data" className="text-primary hover:underline">
                halaman Data
              </Link>
              .
            </p>
            {fieldErrors.karyawan && (
              <p id="err-karyawan" className="text-xs text-red-700">
                {fieldErrors.karyawan}
              </p>
            )}

            {/* Loading: skeleton rows, not text */}
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

            {/* Search error: inline retry */}
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

            {/* Results listbox (combobox target) */}
            {options.length > 0 && (
              <div
                role="listbox"
                id="pkwt-listbox"
                aria-label="Hasil pencarian karyawan"
                className="max-h-64 divide-y divide-border overflow-y-auto rounded-md border border-border"
              >
                {options.map((o, i) => (
                  <div
                    key={o.nama_key}
                    id={`pkwt-opt-${i}`}
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

            {/* No-results: teaches the fix, links to /data */}
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

        {/* Step 2: verification preview (read-only, clearly automatic) */}
        <section aria-labelledby="pkwt-step-2" className="space-y-3 border-t border-border pt-6">
          {stepHeading(2, "Verifikasi data")}

          {loadingDetail && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-[180px] rounded-md motion-reduce:animate-none" />
              ))}
            </div>
          )}

          {detailError && !loadingDetail && (
            <div role="alert" className="rounded-md border border-border bg-surface-2 p-3 text-sm">
              <p className="font-semibold text-text-1">Gagal memuat data karyawan</p>
              <p className="mt-0.5 text-text-2">{detailError}, pilih karyawan lagi untuk mengulang.</p>
            </div>
          )}

          {!selectedKey && !loadingDetail && !detailError && (
            <p className="text-sm text-text-2">
              Pilih karyawan untuk melihat data personal, payroll, dan
              perusahaan yang akan terisi otomatis.
            </p>
          )}

          {emp && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-md border border-border bg-surface-2 p-4">
                <h3 className="mb-2 text-[13px] font-semibold text-text-1">
                  Personal (otomatis)
                </h3>
                <dl className="space-y-1.5 text-sm">
                  <div><dt className="text-xs text-text-2">Nama</dt><dd className="font-semibold text-text-1">{emp.nama_asli}</dd></div>
                  <div><dt className="text-xs text-text-2">TTL</dt><dd className="font-medium text-text-1">{[emp.tempat_lahir, formatTanggalId(emp.tanggal_lahir)].filter(Boolean).join(", ") || "-"}</dd></div>
                  <div><dt className="text-xs text-text-2">Alamat</dt><dd className="font-medium text-text-1">{emp.alamat_tinggal || "-"}</dd></div>
                  <div><dt className="text-xs text-text-2">No. KTP</dt><dd className="font-medium font-mono text-text-1">{emp.no_ktp || "-"}</dd></div>
                  <div><dt className="text-xs text-text-2">Posisi / Divisi</dt><dd className="font-medium text-text-1">{[emp.posisi, emp.divisi].filter(Boolean).join(" · ") || "-"}</dd></div>
                </dl>
              </div>
              <div className="rounded-md border border-border bg-surface-2 p-4">
                <h3 className="mb-2 text-[13px] font-semibold text-text-1">
                  Payroll (otomatis{pay?.periode_bulan ? ` · ${pay.periode_bulan}` : ""})
                </h3>
                {pay ? (
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between"><dt className="text-text-2">Gapok</dt><dd className="font-semibold tabular text-text-1">{formatRp(pay.gapok)}</dd></div>
                    <div className="flex justify-between"><dt className="text-text-2">U. Makan</dt><dd className="font-medium tabular text-text-1">{formatRp(pay.u_makan)}/hari</dd></div>
                    <div className="flex justify-between"><dt className="text-text-2">U. Transport</dt><dd className="font-medium tabular text-text-1">{formatRp(pay.u_transport)}/hari</dd></div>
                    <div className="flex justify-between"><dt className="text-text-2">T. Jabatan</dt><dd className="font-medium tabular text-text-1">{formatRp(pay.t_jabatan)}</dd></div>
                    <div className="flex justify-between"><dt className="text-text-2">T. Fungsional</dt><dd className="font-medium tabular text-text-1">{formatRp(pay.t_fungsional)}</dd></div>
                    <div className="flex justify-between"><dt className="text-text-2">T. Kesehatan</dt><dd className="font-medium tabular text-text-1">{formatRp(pay.t_kesehatan)}</dd></div>
                    <div className="flex justify-between"><dt className="text-text-2">T. Transport</dt><dd className="font-medium tabular text-text-1">{formatRp(pay.t_transport)}</dd></div>
                  </dl>
                ) : (
                  <p className="text-sm text-amber-700">
                    Payroll belum ada. Impor payroll dulu di halaman Data;
                    komponen akan terisi Rp 0,-.
                  </p>
                )}
              </div>
              <div className="rounded-md border border-border bg-surface-2 p-4">
                <h3 className="mb-2 text-[13px] font-semibold text-text-1">
                  Perusahaan (otomatis)
                </h3>
                <dl className="space-y-1.5 text-sm">
                  <div><dt className="text-xs text-text-2">Lini Bisnis</dt><dd className="font-semibold text-text-1">{emp.lini_bisnis || "-"}</dd></div>
                  <div><dt className="text-xs text-text-2">Kode KOP</dt><dd className="font-semibold font-mono text-text-1">{company?.code || "-"}</dd></div>
                  <div>
                    <dt className="text-xs text-text-2">Status KOP</dt>
                    <dd>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${company?.hasKop ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                        {company?.hasKop ? "Ada KOP" : "Tanpa KOP (tambah manual)"}
                      </span>
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          )}
        </section>

        {/* Step 3: manual fields + submit */}
        <section aria-labelledby="pkwt-step-3" className="space-y-4 border-t border-border pt-6">
          {stepHeading(3, "Tanggal & Buat")}

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="tanggal_mulai">
                Tanggal Mulai Kontrak{" "}
                <span className="text-red-600" aria-hidden="true">*</span>
                <span className="sr-only"> (wajib)</span>
              </Label>
              <Input
                id="tanggal_mulai"
                type="date"
                value={tanggalMulai}
                onChange={(e) => {
                  setTanggalMulai(e.target.value);
                  if (e.target.value) {
                    setFieldErrors((f) => ({ ...f, tanggal_mulai: undefined }));
                  }
                }}
                onBlur={() => {
                  if (!tanggalMulai && submitAttempted) {
                    setFieldErrors((f) => ({
                      ...f,
                      tanggal_mulai: "Tanggal Mulai Kontrak wajib diisi, pilih tanggalnya",
                    }));
                  }
                }}
                aria-invalid={fieldErrors.tanggal_mulai ? true : undefined}
                aria-describedby={fieldErrors.tanggal_mulai ? "err-tanggal_mulai" : undefined}
                className={`h-10 ${fieldErrors.tanggal_mulai ? "border-red-600" : ""}`}
              />
              {fieldErrors.tanggal_mulai && (
                <p id="err-tanggal_mulai" className="text-xs text-red-700">
                  {fieldErrors.tanggal_mulai}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="jangka">
                Jangka Waktu <span className="text-red-600" aria-hidden="true">*</span>
                <span className="sr-only"> (wajib)</span>
              </Label>
              <Select value={jangkaBulan} onValueChange={setJangkaBulan}>
                <SelectTrigger id="jangka" className="h-10">
                  <SelectValue placeholder="Pilih..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 Bulan</SelectItem>
                  <SelectItem value="3">3 Bulan</SelectItem>
                  <SelectItem value="6">6 Bulan</SelectItem>
                  <SelectItem value="12">12 Bulan</SelectItem>
                </SelectContent>
              </Select>
              {tanggalBerakhirISO && (
                <p className="text-xs text-text-2">
                  Berakhir:{" "}
                  <span className="font-semibold text-text-1">
                    {formatTanggalId(tanggalBerakhirISO)}
                  </span>
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tanggal_ttd">Tanggal Penandatanganan</Label>
              <Input
                id="tanggal_ttd"
                type="date"
                value={tanggalTtd}
                onChange={(e) => setTanggalTtd(e.target.value)}
                className="h-10"
              />
            </div>
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
                  Membuat PKWT...
                </>
              ) : (
                "Buat PKWT Sekarang"
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
