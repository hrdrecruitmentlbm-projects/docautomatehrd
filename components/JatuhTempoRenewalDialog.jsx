"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Loader2, Sparkles, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addMonthsIso, addDaysIso, formatIsoId, toIsoDate, getTodayWib } from "@/lib/contract-lifecycle";

const TERM_OPTIONS = [
  { value: "1", label: "1 Bulan" },
  { value: "3", label: "3 Bulan" },
  { value: "6", label: "6 Bulan" },
  { value: "12", label: "12 Bulan (1 Tahun)" },
  { value: "24", label: "24 Bulan (2 Tahun)" },
];

function computeDefaultStart(endIso) {
  if (!endIso) return getTodayWib();
  const nextDay = addDaysIso(endIso, 1);
  return nextDay || getTodayWib();
}

function RenewalDialogBody({ item, onClose }) {
  const router = useRouter();
  const [startDate, setStartDate] = React.useState(() =>
    computeDefaultStart(item?.tanggal_habis_kontrak)
  );
  const [termMonths, setTermMonths] = React.useState("12");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [createdDoc, setCreatedDoc] = React.useState(null);

  const months = Number(termMonths) || 12;
  const calculatedEnd = startDate ? addMonthsIso(startDate, months) : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!startDate) {
      setError("Tanggal mulai kontrak baru wajib diisi");
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/documents/duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.document_id || undefined,
          employee_nama_key: item.nama_key,
          tanggal_mulai: startDate,
          jangka_bulan: months,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || `Gagal membuat perpanjangan (HTTP ${res.status})`);
      }

      setCreatedDoc(data);
      toast.success(`Perpanjangan PKWT untuk ${item.nama_asli} berhasil dibuat!`);
      router.refresh();
    } catch (err) {
      setError(err.message || "Terjadi kesalahan saat membuat perpanjangan");
      toast.error(err.message || "Gagal membuat perpanjangan");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-base font-semibold text-text-1">
          <Sparkles className="size-4 text-primary" />
          Buat Perpanjangan PKWT
        </DialogTitle>
        <DialogDescription className="text-xs text-text-2">
          Membuat salinan perpanjangan kontrak resmi dengan nomor baru menggunakan data master dan payroll terkini.
        </DialogDescription>
      </DialogHeader>

      {createdDoc ? (
        <div className="space-y-4 py-3">
          <div className="rounded-lg border border-emerald-300 bg-emerald-50/70 p-4 text-emerald-950">
            <p className="font-semibold text-sm">Dokumen Berhasil Dibuat!</p>
            <p className="mt-1 text-xs text-emerald-800">
              Nomor Surat: <span className="font-mono font-medium">{createdDoc.documentNumber || "-"}</span>
            </p>
            <p className="text-xs text-emerald-800">
              Karyawan: <span className="font-medium">{item.nama_asli}</span> ({months} Bulan)
            </p>
          </div>

          {createdDoc.docUrl && (
            <a
              href={createdDoc.docUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90"
            >
              <ExternalLink className="size-4" />
              Buka Dokumen di Google Docs
            </a>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Tutup
            </Button>
          </DialogFooter>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {/* Ringkasan Karyawan */}
          <div className="rounded-md border border-border bg-surface-2 p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-text-2">Karyawan:</span>
              <span className="font-semibold text-text-1">{item.nama_asli}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-2">Posisi / Lini:</span>
              <span className="text-text-1">
                {item.posisi || "-"} ({item.lini_bisnis || "-"})
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-2">Akhir Kontrak Lama:</span>
              <span className="font-medium text-text-1">{formatIsoId(item.tanggal_habis_kontrak)}</span>
            </div>
            {item.selisih_dokumen && (
              <div className="mt-1 border-t border-border/60 pt-1 text-amber-700">
                <span className="font-medium">Catatan:</span> Tanggal dokumen fisik (
                {formatIsoId(item.selisih_dokumen.dokumen)}) berbeda dari Sheet.
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-800">
              <AlertCircle className="size-4 shrink-0 text-red-600 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="start-date" className="text-xs">
                Tanggal Mulai Baru
              </Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9 font-mono text-xs"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="term-months" className="text-xs">
                Durasi Perpanjangan
              </Label>
              <Select value={termMonths} onValueChange={setTermMonths}>
                <SelectTrigger id="term-months" className="h-9 text-xs">
                  <SelectValue placeholder="Pilih durasi..." />
                </SelectTrigger>
                <SelectContent>
                  {TERM_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border border-border/80 bg-surface-1 p-2.5 text-xs text-text-2">
            <span className="font-medium text-text-1">Perkiraan Berakhir:</span>{" "}
            {calculatedEnd ? formatIsoId(calculatedEnd) : "-"}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={busy}
            >
              Batal
            </Button>
            <Button type="submit" size="sm" disabled={busy} className="bg-primary text-primary-foreground">
              {busy ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Membuat Dokumen...
                </>
              ) : (
                <>
                  <Sparkles className="mr-1.5 size-3.5" />
                  Buat Perpanjangan
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      )}
    </>
  );
}

export function JatuhTempoRenewalDialog({ item, open, onOpenChange }) {
  if (!item) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md sm:max-w-lg">
        {open && <RenewalDialogBody key={item.id || item.nama_key} item={item} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
