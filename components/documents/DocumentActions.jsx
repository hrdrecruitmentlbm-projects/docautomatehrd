"use client";
import { readJson } from "@/lib/http";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  MoreHorizontal,
  ExternalLink,
  Link2,
  Copy,
  FileDown,
  ScanSearch,
  FolderOpen,
  Loader2,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Tindakan untuk satu baris dokumen.
 *
 * Komponen Client karena menu dan dialog butuh state; tabelnya sendiri
 * tetap Server Component. Pola yang sama dengan CopyLinkButton.
 *
 * "Buka di Google Docs" tetap tombol yang terlihat — itu 90% klik. Sisanya
 * masuk menu overflow supaya tabel tidak jadi lebar dan berantakan.
 *
 * DARI TINDAKAN YANG TIDAK ADA — sengaja:
 *   "Isi ulang penanda" tidak mungkin. replacePlaceholders() menghapus
 *   {{…}} saat mengisi, jadi dokumen yang sudah jadi tidak punya penanda
 *   untuk diisi lagi; panggilan kedua diam-diam tidak mengubah apa pun.
 *   Yang benar adalah "Buat Salinan": dokumen baru, nomor baru, data baru.
 */

const TERM_OPTIONS = [
  { value: "1", label: "1 Bulan" },
  { value: "3", label: "3 Bulan" },
  { value: "6", label: "6 Bulan" },
  { value: "12", label: "12 Bulan" },
  { value: "24", label: "24 Bulan" },
];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  // Fallback untuk konteks non-secure (mis. akses lewat IP di jaringan internal).
  const el = document.createElement("textarea");
  el.value = text;
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.select();
  document.execCommand("copy");
  document.body.removeChild(el);
  return Promise.resolve();
}

export function DocumentActions({
  id,
  docUrl,
  folderId,
  documentType,
  tanggalMulai,
  jangkaBulan,
  unfilled,
  size = "row",
}) {
  const router = useRouter();
  const [dupOpen, setDupOpen] = React.useState(false);
  const [dupStart, setDupStart] = React.useState(tanggalMulai || todayISO());
  const [dupTerm, setDupTerm] = React.useState(String(jangkaBulan || 12));
  const [dupBusy, setDupBusy] = React.useState(false);
  const [dupError, setDupError] = React.useState(null);
  const [verifying, setVerifying] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const isPkwt = documentType === "pkwt";

  const onCopy = async () => {
    if (!docUrl) return;
    try {
      await copyText(docUrl);
      setCopied(true);
      toast.success("Link dokumen disalin");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Gagal menyalin link");
    }
  };

  const onOpenFolder = () => {
    if (!folderId) return;
    window.open(
      `https://drive.google.com/drive/folders/${folderId}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  // Unduh lewat anchor sementara: location.href bisa memindahkan halaman di
  // sebagian browser walau Content-Disposition sudah attachment.
  const onDownloadPdf = () => {
    const a = document.createElement("a");
    a.href = `/api/documents/${id}/pdf`;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const onVerify = async () => {
    setVerifying(true);
    try {
      const res = await fetch("/api/documents/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || "Gagal memeriksa dokumen");
      if (!data.persisted) {
        toast.warning("Hasil pemeriksaan tidak tersimpan — jalankan supabase/pkwt-contract.sql");
      }
      if (data.unfilled?.length) {
        toast.warning(`${data.unfilled.length} penanda belum terisi di dokumen ini`);
      } else {
        toast.success("Semua penanda terisi");
      }
      router.refresh();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setVerifying(false);
    }
  };

  const onDuplicate = async () => {
    setDupBusy(true);
    setDupError(null);
    try {
      const res = await fetch("/api/documents/duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          tanggal_mulai: dupStart,
          jangka_bulan: Number(dupTerm),
        }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || "Gagal membuat salinan");
      setDupOpen(false);
      toast.success(`Salinan dibuat: ${data.documentNumber}`);
      if (data.unfilled?.length) {
        toast.warning(`${data.unfilled.length} penanda belum terisi — periksa dokumen barunya`);
      }
      router.push(`/input-dokumen/${data.docId}`);
    } catch (e) {
      setDupError(e.message);
    } finally {
      setDupBusy(false);
    }
  };

  // Varian "rincian": tombol yang terlihat, tanpa menu.
  if (size === "detail") {
    return (
      <div className="flex flex-col gap-2">
        <a href={docUrl} target="_blank" rel="noreferrer">
          <Button className="h-10 w-full">
            <ExternalLink className="mr-2 size-4" aria-hidden="true" />
            Buka di Google Docs
          </Button>
        </a>
        <Button variant="outline" className="h-10 w-full" onClick={onCopy}>
          {copied ? (
            <Check className="mr-2 size-4 text-primary" aria-hidden="true" />
          ) : (
            <Link2 className="mr-2 size-4" aria-hidden="true" />
          )}
          Salin link
        </Button>
        <a href={`/api/documents/${id}/pdf`} download>
          <Button variant="outline" className="h-10 w-full">
            <FileDown className="mr-2 size-4" aria-hidden="true" />
            Unduh PDF
          </Button>
        </a>
        {isPkwt && (
          <Button variant="outline" className="h-10 w-full" onClick={() => setDupOpen(true)}>
            <Copy className="mr-2 size-4" aria-hidden="true" />
            Buat Salinan
          </Button>
        )}
        {folderId && (
          <a
            href={`https://drive.google.com/drive/folders/${folderId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-surface-1 px-4 text-sm font-medium text-text-1 transition-colors hover:bg-surface-2"
          >
            <FolderOpen className="mr-2 size-4" aria-hidden="true" />
            Buka folder di Drive
          </a>
        )}
        <DuplicateDialog
          open={dupOpen}
          onOpenChange={setDupOpen}
          start={dupStart}
          term={dupTerm}
          onStartChange={setDupStart}
          onTermChange={setDupTerm}
          onSubmit={onDuplicate}
          busy={dupBusy}
          error={dupError}
        />
      </div>
    );
  }

  // Varian "baris": ikon buka + menu overflow.
  return (
    <>
      <div className="flex items-center justify-end gap-1">
        <a
          href={docUrl}
          target="_blank"
          rel="noreferrer"
          className="relative inline-flex size-9 items-center justify-center rounded-md text-text-2 transition-colors hover:bg-surface-2 hover:text-text-1 after:absolute after:-inset-1 after:content-['']"
          aria-label={`Buka di Google Docs`}
        >
          <ExternalLink className="size-4" aria-hidden="true" />
        </a>

        <DropdownMenu>
          <DropdownMenuTrigger
            className="relative inline-flex size-9 items-center justify-center rounded-md text-text-2 transition-colors hover:bg-surface-2 hover:text-text-1 data-open:bg-surface-2 after:absolute after:-inset-1 after:content-['']"
            aria-label="Tindakan lain untuk dokumen ini"
          >
            <MoreHorizontal className="size-4" aria-hidden="true" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 shadow-popover">
            <DropdownMenuLabel className="truncate text-xs text-text-2">
              Tindakan
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => router.push(`/input-dokumen/${id}`)}>
              <ScanSearch className="size-4" />
              Lihat rincian
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onCopy}>
              {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
              Salin link
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onDownloadPdf}>
              <FileDown className="size-4" />
              Unduh PDF
            </DropdownMenuItem>

            {isPkwt && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setDupOpen(true)}>
                  <Copy className="size-4" />
                  Buat Salinan
                </DropdownMenuItem>
              </>
            )}

            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onVerify} disabled={verifying}>
              {verifying ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ScanSearch className="size-4" />
              )}
              Periksa penanda
            </DropdownMenuItem>
            {unfilled?.length > 0 && (
              <DropdownMenuLabel className="text-xs font-normal text-amber-700">
                {unfilled.length} penanda belum terisi
              </DropdownMenuLabel>
            )}
            {folderId && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onOpenFolder}>
                  <FolderOpen className="size-4" />
                  Buka folder di Drive
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <DuplicateDialog
        open={dupOpen}
        onOpenChange={setDupOpen}
        start={dupStart}
        term={dupTerm}
        onStartChange={setDupStart}
        onTermChange={setDupTerm}
        onSubmit={onDuplicate}
        busy={dupBusy}
        error={dupError}
      />
    </>
  );
}

function DuplicateDialog({
  open,
  onOpenChange,
  start,
  term,
  onStartChange,
  onTermChange,
  onSubmit,
  busy,
  error,
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Buat Salinan</DialogTitle>
          <DialogDescription>
            Kontrak baru dengan nomor baru untuk karyawan yang sama. Dokumen ini
            tidak diubah — tetap jadi bukti kontrak sebelumnya.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="dup-start">Tanggal mulai kontrak</Label>
            <Input
              id="dup-start"
              type="date"
              value={start}
              onChange={(e) => onStartChange(e.target.value)}
              className="h-10"
            />
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium text-text-1">Jangka waktu</legend>
            <div className="flex flex-wrap gap-1.5">
              {TERM_OPTIONS.map((o) => {
                const active = term === o.value;
                return (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => onTermChange(o.value)}
                    aria-pressed={active}
                    className={`h-9 rounded-md border px-3 text-sm font-medium transition-colors ${
                      active
                        ? "border-transparent bg-primary text-primary-foreground"
                        : "border-border bg-surface-1 text-text-1 hover:bg-surface-2"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {error && (
            <div role="alert" className="rounded-md border border-border bg-surface-2 p-3 text-sm">
              <p className="font-semibold text-text-1">Gagal membuat salinan</p>
              <p className="mt-0.5 text-text-2">{error}</p>
            </div>
          )}

          <p className="text-xs text-text-2">
            Tanggal berakhir dihitung dari tanggal mulai di atas. Data karyawan dan
            payroll diambil ulang dari master, jadi perbaikan di master ikut
            terbawa ke dokumen baru.
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="h-10"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Batal
          </Button>
          <Button
            type="button"
            className="h-10"
            onClick={onSubmit}
            disabled={busy || !start}
            aria-busy={busy}
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                Membuat salinan...
              </>
            ) : (
              "Buat Salinan"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
