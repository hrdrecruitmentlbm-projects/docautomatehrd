"use client";

import { useEffect, useState } from "react";
import { readJson } from "@/lib/http";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Loader2,
  Save,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  FileEdit,
  Clock,
  Sparkles,
} from "lucide-react";

/**
 * Helper client-side untuk menghitung pratinjau jangka bulan secara aman
 */
function getDurationPreview(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const dStart = new Date(startIso + "T00:00:00Z");
  const dEnd = new Date(endIso + "T00:00:00Z");
  if (isNaN(dStart.getTime()) || isNaN(dEnd.getTime())) return null;
  if (dEnd.getTime() <= dStart.getTime()) {
    return { valid: false, error: `Tanggal berakhir (${endIso}) harus setelah tanggal mulai (${startIso})` };
  }

  const years = dEnd.getUTCFullYear() - dStart.getUTCFullYear();
  const months = dEnd.getUTCMonth() - dStart.getUTCMonth();
  const days = dEnd.getUTCDate() - dStart.getUTCDate();

  let totalMonths = years * 12 + months;
  if (days >= 25 || days <= -25) {
    totalMonths += 1;
  }
  return { valid: true, months: totalMonths > 0 ? totalMonths : 1 };
}

export function PkwtCorrectionsTable() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [savingId, setSavingId] = useState(null);

  const fetchItems = async (isManual = false) => {
    if (isManual) setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/pkwt-corrections");
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || "Gagal memuat dokumen perlu dicek");
      setRows(data.items || []);
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    async function loadInitial() {
      try {
        const res = await fetch("/api/pkwt-corrections");
        const data = await readJson(res);
        if (!ignore) {
          if (!res.ok) throw new Error(data.error || "Gagal memuat dokumen perlu dicek");
          setRows(data.items || []);
        }
      } catch (err) {
        if (!ignore) setLoadError(err.message);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    loadInitial();

    const handleScanDone = () => fetchItems(true);
    if (typeof window !== "undefined") {
      window.addEventListener("pkwt-scan-completed", handleScanDone);
      return () => {
        ignore = true;
        window.removeEventListener("pkwt-scan-completed", handleScanDone);
      };
    }
    return () => {
      ignore = true;
    };
  }, []);

  const updateRowField = (id, field, value) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  const handleSaveCorrection = async (row) => {
    const rawStart = String(row.tanggal_mulai || "").trim();
    const rawEnd = String(row.tanggal_berakhir || "").trim();

    if (!rawStart) {
      toast.error("Tanggal mulai wajib diisi sebelum menyimpan koreksi");
      return;
    }
    if (!rawEnd) {
      toast.error("Tanggal berakhir wajib diisi sebelum menyimpan koreksi");
      return;
    }

    const durationInfo = getDurationPreview(rawStart, rawEnd);
    if (!durationInfo || !durationInfo.valid) {
      toast.error(durationInfo?.error || `Tanggal berakhir (${rawEnd}) harus setelah tanggal mulai (${rawStart})`);
      return;
    }

    setSavingId(row.id);
    try {
      const res = await fetch("/api/pkwt-corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: row.id,
          file_id: row.file_id,
          tanggal_mulai: rawStart,
          tanggal_berakhir: rawEnd,
          nomor_surat: row.nomor_surat,
          kode_perusahaan: row.kode_perusahaan,
        }),
      });

      const data = await readJson(res);
      if (!res.ok) {
        throw new Error(data.error || "Gagal menyimpan koreksi manual");
      }

      toast.success(
        `Koreksi tersimpan: ${row.nama_asli || row.nomor_surat} (${durationInfo.months} bulan)`
      );

      // Baris yang sudah dikoreksi otomatis hilang dari daftar "Perlu dicek"
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (err) {
      toast.error(err.message || "Gagal menyimpan koreksi manual");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section id="perlu-dicek" aria-labelledby="pkwt-corrections-heading" className="scroll-mt-20 border-t border-border p-5 sm:p-6">
      {/* Header Section */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <div className="rounded-lg bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
            <FileEdit className="size-5 shrink-0" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 id="pkwt-corrections-heading" className="text-[15px] font-semibold text-text-1">
                Koreksi Manual Dokumen PKWT
              </h2>
              {rows.length > 0 && (
                <span className="inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  {rows.length} perlu dicek
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-text-2">
              Dokumen hasil pemindaian Google Drive yang memerlukan verifikasi tanggal kontrak. Menyimpan tanggal akan mengaktifkan <span className="font-mono text-text-1">manual_override</span> sehingga tidak akan tertimpa saat sinkronisasi ulang.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchItems}
            disabled={loading}
            className="h-8 gap-1.5 text-xs"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            Muat Ulang
          </Button>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12 text-sm text-text-2 gap-2">
          <Loader2 className="size-4 animate-spin text-primary" />
          Memuat daftar dokumen PKWT yang perlu dicek...
        </div>
      )}

      {/* Error state */}
      {!loading && loadError && (
        <div className="mt-4 flex items-center justify-between rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" />
            <span>{loadError}</span>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={fetchItems} className="h-7 text-xs">
            Coba Lagi
          </Button>
        </div>
      )}

      {/* Empty State */}
      {!loading && !loadError && rows.length === 0 && (
        <div className="mt-4 flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface-0/50 py-10 text-center">
          <div className="rounded-full bg-emerald-500/10 p-3 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-6" />
          </div>
          <p className="mt-3 text-sm font-semibold text-text-1">
            Semua Dokumen Terverifikasi
          </p>
          <p className="mt-1 max-w-md text-xs text-text-2">
            Tidak ada dokumen PKWT yang perlu dicek. Semua file hasil scan telah memiliki tanggal kontrak yang lengkap atau sudah dikoreksi secara manual.
          </p>
        </div>
      )}

      {/* Corrections Table */}
      {!loading && !loadError && rows.length > 0 && (
        <div className="mt-4 overflow-hidden rounded-lg border border-border">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface-2/60 text-xs">
                  <TableHead className="w-[180px] font-semibold text-text-1">Nama Karyawan</TableHead>
                  <TableHead className="w-[200px] font-semibold text-text-1">Nomor Surat</TableHead>
                  <TableHead className="w-[100px] font-semibold text-text-1">Kode PT</TableHead>
                  <TableHead className="min-w-[200px] font-semibold text-text-1">Alasan Dicek</TableHead>
                  <TableHead className="w-[140px] font-semibold text-text-1">Tanggal Mulai</TableHead>
                  <TableHead className="w-[140px] font-semibold text-text-1">Tanggal Berakhir</TableHead>
                  <TableHead className="w-[110px] font-semibold text-text-1 text-center">Durasi</TableHead>
                  <TableHead className="w-[100px] font-semibold text-text-1 text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const duration = getDurationPreview(row.tanggal_mulai, row.tanggal_berakhir);
                  const isSaving = savingId === row.id;
                  const hasInvalidDates = duration && !duration.valid;

                  return (
                    <TableRow key={row.id} className="text-xs hover:bg-surface-2/40 transition-colors">
                      {/* Nama Karyawan */}
                      <TableCell className="align-middle">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium text-text-1">
                            {row.nama_asli || "Tanpa Nama"}
                          </span>
                          {row.url ? (
                            <a
                              href={row.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                            >
                              <ExternalLink className="size-3" />
                              Buka Dokumen
                            </a>
                          ) : (
                            <span className="text-[11px] text-text-2 font-mono">{row.file_id}</span>
                          )}
                        </div>
                      </TableCell>

                      {/* Nomor Surat */}
                      <TableCell className="align-middle">
                        <span className="font-mono text-[11px] text-text-1 break-all">
                          {row.nomor_surat || "-"}
                        </span>
                        {row.bulan_folder && (
                          <span className="block text-[10px] text-text-2">
                            Folder: {row.bulan_folder}
                          </span>
                        )}
                      </TableCell>

                      {/* Kode Perusahaan */}
                      <TableCell className="align-middle">
                        {row.kode_perusahaan ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium bg-surface-2 text-text-1 border border-border">
                            {row.kode_perusahaan}
                          </span>
                        ) : (
                          <span className="text-text-2">-</span>
                        )}
                      </TableCell>

                      {/* Alasan Cek */}
                      <TableCell className="align-middle">
                        <div className="flex items-start gap-1.5 text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
                          <span className="text-[11px] leading-tight">
                            {row.alasan_cek || "Perlu verifikasi tanggal kontrak"}
                          </span>
                        </div>
                      </TableCell>

                      {/* Input Tanggal Mulai */}
                      <TableCell className="align-middle">
                        <input
                          type="date"
                          value={row.tanggal_mulai || ""}
                          onChange={(e) => updateRowField(row.id, "tanggal_mulai", e.target.value)}
                          className="h-8 w-full rounded border border-border bg-surface-0 px-2 text-xs font-mono text-text-1 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </TableCell>

                      {/* Input Tanggal Berakhir */}
                      <TableCell className="align-middle">
                        <input
                          type="date"
                          value={row.tanggal_berakhir || ""}
                          onChange={(e) => updateRowField(row.id, "tanggal_berakhir", e.target.value)}
                          className={`h-8 w-full rounded border bg-surface-0 px-2 text-xs font-mono text-text-1 focus:outline-none focus:ring-1 ${
                            hasInvalidDates
                              ? "border-destructive text-destructive focus:border-destructive focus:ring-destructive"
                              : "border-border focus:border-primary focus:ring-primary"
                          }`}
                        />
                      </TableCell>

                      {/* Durasi Preview */}
                      <TableCell className="align-middle text-center">
                        {duration ? (
                          duration.valid ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                              <Clock className="size-3" />
                              {duration.months} bln
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-destructive/10 text-destructive border border-destructive/20 cursor-help"
                              title={duration.error}
                            >
                              <AlertTriangle className="size-3 shrink-0" />
                              Tgl salah
                            </span>
                          )
                        ) : (
                          <span className="text-text-2">-</span>
                        )}
                      </TableCell>

                      {/* Tombol Simpan */}
                      <TableCell className="align-middle text-right">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleSaveCorrection(row)}
                          disabled={
                            isSaving ||
                            !row.tanggal_mulai ||
                            !row.tanggal_berakhir ||
                            Boolean(hasInvalidDates)
                          }
                          className="h-8 gap-1.5 text-xs bg-primary hover:bg-primary/90 text-primary-foreground"
                        >
                          {isSaving ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Save className="size-3.5" />
                          )}
                          Simpan
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </section>
  );
}
