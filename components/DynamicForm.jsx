"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import Link from "next/link";
import { COMPANY_CODES } from "@/lib/company-codes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FileDown, Loader2, AlertTriangle, RotateCcw, ArrowRight } from "lucide-react";

/**
 * SK / Memo / SP form. 2-step (Isi data -> Buat).
 * Validation: validate-on-blur, inline errors below fields with
 * cause+fix copy, aria-invalid + aria-describedby, focus-first-invalid
 * on failed submit, and an error summary with field links when >1 error.
 * Zero validation toasts: toasts carry async outcomes only.
 */
export function DynamicForm({ config }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [submitError, setSubmitError] = useState(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm({ mode: "onBlur" });

  const fieldOrder = ["companyCode", ...config.fields.map((f) => f.key)];

  // focus-first-invalid (WCAG): the first errored field in visual order
  // gets focus + scroll, whether it is an input or a Select trigger.
  const onInvalid = (errs) => {
    setSubmitAttempted(true);
    const firstKey = fieldOrder.find((k) => errs[k]);
    if (!firstKey) return;
    const el = document.getElementById(
      firstKey === "companyCode" ? "trigger-companyCode" : firstKey
    );
    el?.focus();
    el?.scrollIntoView({ block: "center" });
  };

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    setSubmitError(null);
    setResult(null);
    try {
      const { companyCode, ...formData } = data;

      const response = await fetch("/api/generate-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: config.id,
          companyCode: companyCode,
          formData: formData,
        }),
      });

      const resultData = await response.json();

      if (!response.ok) {
        throw new Error(resultData.error || "Terjadi kesalahan");
      }

      setResult(resultData);
      toast.success("Dokumen berhasil dibuat!");
    } catch (error) {
      // Async failure: inline retry panel + outcome toast (form keeps data).
      setSubmitError(error.message);
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const errorList = submitAttempted
    ? fieldOrder.filter((k) => errors[k])
    : [];

  const errId = (key) => `err-${key}`;
  const describedBy = (key) => (errors[key] ? errId(key) : undefined);
  const invalidBorder = (key) =>
    errors[key] ? "border-red-600 focus-visible:border-red-600" : "";

  const renderError = (key) =>
    errors[key] ? (
      <p id={errId(key)} className="mt-1.5 text-xs text-red-700">
        {errors[key].message}
      </p>
    ) : null;

  return (
    <div className="space-y-4">
      {/* Success: brand wash, ONE primary, secondary reset, tertiary link */}
      {result && (
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-brand-wash p-5 sm:p-6 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold text-brand-wash-ink">
              Dokumen berhasil dibuat
            </h2>
            {result.documentNumber && (
              <p className="mt-1 font-mono text-sm text-brand-wash-ink">
                {result.documentNumber}
              </p>
            )}
            <p className="mt-1 text-sm text-brand-wash-ink/90">
              Tersimpan di Google Drive.
            </p>
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
        onSubmit={handleSubmit(onSubmit, onInvalid)}
        className="space-y-6 rounded-lg border border-border bg-surface-1 p-5 sm:p-6"
      >
        {/* 2-step indicator: a real sequence, so numbering earns its place */}
        <ol className="flex items-center gap-4 text-sm" aria-label="Langkah pembuatan">
          <li
            aria-current={result ? undefined : "step"}
            className={`flex items-center gap-2 ${result ? "text-text-2" : "font-semibold text-text-1"}`}
          >
            <span
              className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
                result ? "bg-surface-3 text-text-2" : "bg-brand-wash text-brand-wash-ink"
              }`}
              aria-hidden="true"
            >
              1
            </span>
            Isi data
          </li>
          <li aria-hidden="true" className="h-px flex-1 bg-border" />
          <li
            aria-current={result ? "step" : undefined}
            className={`flex items-center gap-2 ${result ? "font-semibold text-text-1" : "text-text-2"}`}
          >
            <span
              className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
                result ? "bg-brand-wash text-brand-wash-ink" : "bg-surface-3 text-text-2"
              }`}
              aria-hidden="true"
            >
              2
            </span>
            Buat
          </li>
        </ol>

        {/* Error summary: only when >1 field is invalid (anchor links focus) */}
        {errorList.length > 1 && (
          <div role="alert" className="rounded-md border border-border bg-surface-2 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold text-text-1">
              <AlertTriangle className="size-4 text-red-600" aria-hidden="true" />
              Lengkapi {errorList.length} isian wajib
            </p>
            <ul className="mt-1.5 list-inside list-disc text-text-2">
              {errorList.map((k) => (
                <li key={k}>
                  <a
                    href={`#${k === "companyCode" ? "trigger-companyCode" : k}`}
                    onClick={(e) => {
                      e.preventDefault();
                      document
                        .getElementById(k === "companyCode" ? "trigger-companyCode" : k)
                        ?.focus();
                    }}
                    className="text-text-1 underline underline-offset-2 hover:text-primary"
                  >
                    {errors[k].message}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Submit failure: persistent inline recovery, data preserved */}
        {submitError && (
          <div role="alert" className="rounded-md border border-border bg-surface-2 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold text-text-1">
              <AlertTriangle className="size-4 text-red-600" aria-hidden="true" />
              Gagal membuat dokumen
            </p>
            <p className="mt-1 text-text-2">
              {submitError} Isian Anda tetap tersimpan, tekan tombol buat untuk
              mencoba lagi.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="trigger-companyCode">
              Perusahaan (Kode){" "}
              <span className="text-red-600" aria-hidden="true">*</span>
              <span className="sr-only"> (wajib)</span>
            </Label>
            <input
              type="hidden"
              id="companyCode"
              {...register("companyCode", { required: "Perusahaan wajib dipilih" })}
            />
            <Select
              onValueChange={(val) =>
                setValue("companyCode", val, { shouldValidate: true, shouldDirty: true })
              }
            >
              <SelectTrigger
                id="trigger-companyCode"
                aria-describedby={describedBy("companyCode")}
                aria-invalid={errors.companyCode ? true : undefined}
                className={`h-10 w-full ${invalidBorder("companyCode")}`}
              >
                <SelectValue placeholder="Pilih perusahaan" />
              </SelectTrigger>
              <SelectContent>
                {COMPANY_CODES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    {c.name} ({c.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {renderError("companyCode")}
          </div>

          {config.fields.map((field) => (
            <div
              key={field.key}
              className={`space-y-1.5 ${field.type === "textarea" ? "md:col-span-2" : ""}`}
            >
              <Label htmlFor={field.key}>
                {field.label}{" "}
                {field.required && (
                  <span className="text-red-600" aria-hidden="true">*</span>
                )}
                {field.required && <span className="sr-only"> (wajib)</span>}
              </Label>

              {field.type === "textarea" ? (
                <Textarea
                  id={field.key}
                  placeholder={`Masukkan ${field.label.toLowerCase()}`}
                  {...register(field.key, {
                    required: field.required ? `${field.label} wajib diisi` : false,
                  })}
                  aria-invalid={errors[field.key] ? true : undefined}
                  aria-describedby={describedBy(field.key)}
                  className={`min-h-[100px] ${invalidBorder(field.key)}`}
                />
              ) : field.type === "select" ? (
                <>
                  <input
                    type="hidden"
                    id={field.key}
                    {...register(field.key, {
                      required: `${field.label} wajib dipilih`,
                    })}
                  />
                  <Select
                    onValueChange={(val) =>
                      setValue(field.key, val, { shouldValidate: true, shouldDirty: true })
                    }
                  >
                    <SelectTrigger
                      aria-describedby={describedBy(field.key)}
                      aria-invalid={errors[field.key] ? true : undefined}
                      className={`h-10 w-full ${invalidBorder(field.key)}`}
                    >
                      <SelectValue placeholder="Pilih..." />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options?.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </>
              ) : (
                <Input
                  id={field.key}
                  type={
                    field.type === "date" ? "date" : field.type === "number" ? "number" : "text"
                  }
                  placeholder={`Masukkan ${field.label.toLowerCase()}`}
                  {...register(field.key, {
                    required: field.required
                      ? field.type === "date"
                        ? `${field.label} wajib diisi, pilih tanggalnya`
                        : `${field.label} wajib diisi`
                      : false,
                  })}
                  aria-invalid={errors[field.key] ? true : undefined}
                  aria-describedby={describedBy(field.key)}
                  className={`h-10 ${invalidBorder(field.key)}`}
                />
              )}
              {renderError(field.key)}
            </div>
          ))}
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
            disabled={isSubmitting}
            aria-busy={isSubmitting}
            className="h-10 w-full min-w-[200px] sm:w-auto"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Membuat Dokumen...
              </>
            ) : (
              "Buat Dokumen Sekarang"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
