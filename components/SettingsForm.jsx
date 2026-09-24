"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { documentConfigs } from "@/lib/document-configs";
import { toast } from "sonner";
import { Save, Loader2 } from "lucide-react";

// Per-type marker dots, bound to the shared doc-type palette
// (agrees with badges, donut cells, legend dots, folder strip).
const DOT_COLORS = {
  pkwt: "bg-primary",
  sk: "bg-amber-600",
  memo: "bg-slate-500",
  sp: "bg-red-600",
};

/**
 * Settings: one panel, two hairline sections (rendered by the page), real
 * h2/h3 headings (fixes the old h1->h4 hierarchy skip), sticky save bar
 * that scrolls with content (never covers the shell), dirty-gated save and
 * a persistent "Tersimpan" indicator. Toast = save outcome only.
 */
export function SettingsForm({ initialSettings = {} }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const { register, handleSubmit, formState: { isDirty } } = useForm({ defaultValues: initialSettings });

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error("Gagal menyimpan pengaturan");

      setSavedAt(new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }));
      toast.success("Pengaturan berhasil disimpan!");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex min-h-full flex-col">
      {/* Section: Umum */}
      <section aria-labelledby="settings-umum" className="p-5 sm:p-6">
        <h2 id="settings-umum" className="text-[15px] font-semibold text-text-1">
          Pengaturan Umum
        </h2>
        <p className="mt-1 text-sm text-text-2">
          Atur penandatangan default untuk semua dokumen.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="signatory_name">Nama Penandatangan (Default)</Label>
            <Input id="signatory_name" {...register('signatory_name')} placeholder="Cth: Budi Santoso" className="h-10" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="signatory_title">Jabatan Penandatangan (Default)</Label>
            <Input id="signatory_title" {...register('signatory_title')} placeholder="Cth: HR Manager" className="h-10" />
          </div>
        </div>
      </section>

      {/* Section: Template & Folder */}
      <section aria-labelledby="settings-template" className="border-t border-border p-5 sm:p-6">
        <h2 id="settings-template" className="text-[15px] font-semibold text-text-1">
          Template &amp; Folder Google Drive
        </h2>
        <p className="mt-1 text-sm text-text-2">
          Ambil ID dari URL Google Drive:{" "}
          <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-xs text-text-1">
            docs.google.com/document/d/INI_ID_NYA/edit
          </code>
        </p>

        <div className="mt-4 space-y-6">
          {documentConfigs.map(config => (
            <div key={config.id} className="border-t border-border pt-5 first:border-t-0 first:pt-0">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-text-1">
                <span
                  className={`size-2 rounded-full ${DOT_COLORS[config.id] || "bg-surface-3"}`}
                  aria-hidden="true"
                />
                Konfigurasi {config.label}
              </h3>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`${config.id}_template_id`}>Template ID (Google Doc)</Label>
                  <Input
                    id={`${config.id}_template_id`}
                    {...register(`${config.id}_template_id`)}
                    placeholder="Masukkan ID Template"
                    className="h-10 font-mono text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${config.id}_folder_id`}>Target Folder ID (Google Drive)</Label>
                  <Input
                    id={`${config.id}_folder_id`}
                    {...register(`${config.id}_folder_id`)}
                    placeholder="Masukkan ID Folder"
                    className="h-10 font-mono text-sm"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Sticky save bar: scrolls within content, below the sticky top bar */}
      <div className="sticky bottom-0 mt-auto flex items-center justify-end gap-3 border-t border-border bg-surface-1 px-5 py-4 sm:px-6">
        {savedAt && !isDirty && (
          <p role="status" className="text-sm text-primary">
            Tersimpan {savedAt}
          </p>
        )}
        <Button
          type="submit"
          disabled={isSubmitting || !isDirty}
          className="h-10 min-w-[160px]"
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Simpan Pengaturan
        </Button>
      </div>
    </form>
  );
}
