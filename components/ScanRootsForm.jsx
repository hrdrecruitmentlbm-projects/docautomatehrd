"use client";

import { useEffect, useRef, useState } from "react";
import { readJson } from "@/lib/http";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  Loader2,
  Save,
  FolderTree,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  FolderCheck,
  Play,
  FileSearch,
  StopCircle,
  AlertTriangle,
  FileCheck2,
  UserX,
  FileQuestion,
  ExternalLink,
} from "lucide-react";
import { extractFolderId, isValidGoogleId } from "@/lib/google-ids";

const DEFAULT_EXCLUSIONS = ["Paklaring", "SLIP EMAIL", "Template", "KOP", "ttd"];

export function ScanRootsForm() {
  const [roots, setRoots] = useState([]);
  const [exclusions, setExclusions] = useState([]);
  const [newExclusion, setNewExclusion] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Status tes akses per baris index
  const [testStatus, setTestStatus] = useState({});

  // Status Pemindai (Scan & Sync)
  const [scanning, setScanning] = useState(false);
  const [scanMode, setScanMode] = useState(null); // "dry-run" | "execute"
  const [scanProgress, setScanProgress] = useState({
    batchNum: 0,
    scanned: 0,
    saved: 0,
    skipped: 0,
    needsCheck: 0,
    unmatched: 0,
    message: "",
  });
  const [scanReport, setScanReport] = useState(null);
  const [activeReportTab, setActiveReportTab] = useState("needsCheck"); // "needsCheck" | "unmatched" | "skipped" | "items"
  const cancelScanRef = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/scan-roots");
        const data = await readJson(res);
        if (!res.ok) throw new Error(data.error || "Gagal memuat konfigurasi folder root");
        setRoots(data.roots || []);
        setExclusions(data.exclusions || DEFAULT_EXCLUSIONS);
      } catch (e) {
        setLoadError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const updateRoot = (index, field, value) => {
    setRoots((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
    if (field === "folder_id") {
      setTestStatus((prev) => {
        const next = { ...prev };
        delete next[index];
        return next;
      });
    }
  };

  const addRootRow = () => {
    setRoots((prev) => [
      ...prev,
      {
        label: `Folder Arsip ${prev.length + 1}`,
        folder_id: "",
        aktif: true,
        mulai_dari_bulan: "",
      },
    ]);
  };

  const removeRootRow = (index) => {
    setRoots((prev) => prev.filter((_, i) => i !== index));
    setTestStatus((prev) => {
      const next = {};
      Object.keys(prev).forEach((k) => {
        const idx = parseInt(k, 10);
        if (idx < index) next[idx] = prev[idx];
        if (idx > index) next[idx - 1] = prev[idx];
      });
      return next;
    });
  };

  const testAccess = async (index) => {
    const row = roots[index];
    const rawInput = String(row?.folder_id || "").trim();

    if (!rawInput) {
      toast.error(`Isi Folder ID atau URL terlebih dahulu untuk "${row?.label || 'baris ini'}"`);
      return;
    }

    const cleanId = extractFolderId(rawInput);
    if (!cleanId || !isValidGoogleId(cleanId)) {
      setTestStatus((prev) => ({
        ...prev,
        [index]: {
          loading: false,
          success: false,
          error: "Format Folder ID atau URL tidak valid.",
        },
      }));
      toast.error("Format Folder ID atau URL tidak valid");
      return;
    }

    setTestStatus((prev) => ({
      ...prev,
      [index]: { loading: true, success: false, error: null, name: null },
    }));

    try {
      const res = await fetch("/api/scan-roots/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: cleanId }),
      });
      const data = await readJson(res);

      if (!res.ok) {
        throw new Error(data.error || "Gagal tes akses folder");
      }

      setTestStatus((prev) => ({
        ...prev,
        [index]: {
          loading: false,
          success: true,
          name: data.name,
          error: null,
        },
      }));
      toast.success(`Akses terverifikasi: "${data.name}"`);
    } catch (e) {
      setTestStatus((prev) => ({
        ...prev,
        [index]: {
          loading: false,
          success: false,
          error: e.message,
          name: null,
        },
      }));
      toast.error(e.message);
    }
  };

  const addExclusion = () => {
    const val = newExclusion.trim();
    if (!val) return;
    if (exclusions.some((x) => x.toLowerCase() === val.toLowerCase())) {
      toast.info(`Pola "${val}" sudah terdaftar`);
      return;
    }
    setExclusions((prev) => [...prev, val]);
    setNewExclusion("");
  };

  const removeExclusion = (index) => {
    setExclusions((prev) => prev.filter((_, i) => i !== index));
  };

  const resetDefaultExclusions = () => {
    setExclusions([...DEFAULT_EXCLUSIONS]);
    toast.info("Pola pengecualian dikembalikan ke default");
  };

  const saveAll = async () => {
    for (let i = 0; i < roots.length; i++) {
      const r = roots[i];
      const lbl = String(r.label || "").trim();
      const raw = String(r.folder_id || "").trim();

      if (!lbl) {
        toast.error(`Baris ke-${i + 1}: Label folder wajib diisi`);
        return;
      }
      if (!raw) {
        toast.error(`Baris "${lbl}": Folder ID atau URL wajib diisi`);
        return;
      }
      const clean = extractFolderId(raw);
      if (!clean || !isValidGoogleId(clean)) {
        toast.error(`Baris "${lbl}": Format Folder ID atau link Drive tidak valid`);
        return;
      }
    }

    setSaving(true);
    try {
      const res = await fetch("/api/scan-roots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roots, exclusions }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan pengaturan");

      toast.success(
        `Pengaturan tersimpan: ${data.totalRoots} root folder & ${data.totalExclusions} pola pengecualian.`
      );
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  // =========================================================================
  // Pemindai Folder Loop (Dry-Run & Execute)
  // =========================================================================
  const runScan = async (selectedMode) => {
    const activeRoots = roots.filter((r) => r.aktif !== false && String(r.folder_id || "").trim());
    if (activeRoots.length === 0) {
      toast.error("Tidak ada root folder aktif. Pastikan ada folder yang aktif dan sudah disimpan.");
      return;
    }

    setScanning(true);
    setScanMode(selectedMode);
    cancelScanRef.current = false;

    const accumulatedReport = {
      mode: selectedMode,
      totalScanned: 0,
      totalSaved: 0,
      totalSkipped: 0,
      totalNeedsCheck: 0,
      totalUnmatched: 0,
      skippedByReason: {},
      needsCheckItems: [],
      unmatchedItems: [],
      processedItems: [],
    };

    setScanProgress({
      batchNum: 0,
      scanned: 0,
      saved: 0,
      skipped: 0,
      needsCheck: 0,
      unmatched: 0,
      message: `Memulai ${selectedMode === "dry-run" ? "simulasi pemindaian (Dry-Run)" : "sinkronisasi dari Drive"}...`,
    });
    setScanReport(null);

    let cursor = null;
    let batchIndex = 1;
    let isDone = false;

    try {
      while (!isDone && !cancelScanRef.current) {
        setScanProgress((prev) => ({
          ...prev,
          batchNum: batchIndex,
          message: `Memproses batch ke-${batchIndex}...`,
        }));

        const res = await fetch("/api/scan-pkwt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: selectedMode, cursor }),
        });

        const data = await readJson(res);
        if (!res.ok) {
          throw new Error(data.error || "Gagal memproses batch pemindaian");
        }

        const b = data.batch || {};
        accumulatedReport.totalScanned += b.scanned || 0;
        accumulatedReport.totalSaved += b.saved || 0;
        accumulatedReport.totalSkipped += (b.skipped || []).length;
        accumulatedReport.totalNeedsCheck += (b.needsCheck || []).length;
        accumulatedReport.totalUnmatched += (b.unmatchedEmployees || []).length;

        (b.skipped || []).forEach((sk) => {
          const r = sk.reason || "Alasan lain";
          accumulatedReport.skippedByReason[r] = (accumulatedReport.skippedByReason[r] || 0) + 1;
        });

        accumulatedReport.needsCheckItems.push(...(b.needsCheck || []));
        accumulatedReport.unmatchedItems.push(...(b.unmatchedEmployees || []));
        accumulatedReport.processedItems.push(...(b.items || []));

        setScanProgress({
          batchNum: batchIndex,
          scanned: accumulatedReport.totalScanned,
          saved: accumulatedReport.totalSaved,
          skipped: accumulatedReport.totalSkipped,
          needsCheck: accumulatedReport.totalNeedsCheck,
          unmatched: accumulatedReport.totalUnmatched,
          message: `Batch ${batchIndex} selesai: ${accumulatedReport.totalScanned} file dipindai (${accumulatedReport.totalSaved} ${selectedMode === "execute" ? "disimpan" : "valid"}).`,
        });

        isDone = !!data.done;
        cursor = data.cursor;
        batchIndex += 1;

        if (!isDone) {
          await new Promise((r) => setTimeout(r, 150));
        }
      }

      if (cancelScanRef.current) {
        toast.info("Pemindaian dihentikan oleh pengguna");
      } else {
        toast.success(
          selectedMode === "execute"
            ? `Sinkronisasi selesai! ${accumulatedReport.totalSaved} dokumen tersimpan di database.`
            : `Dry-run selesai! ${accumulatedReport.totalSaved} dokumen siap disinkronkan.`
        );
        if (selectedMode === "execute" && typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("pkwt-scan-completed"));
        }
      }
      setScanReport(accumulatedReport);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setScanning(false);
    }
  };

  const handleStop = () => {
    cancelScanRef.current = true;
  };

  return (
    <section id="sumber-folder" aria-labelledby="scan-roots-heading" className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="scan-roots-heading" className="flex items-center gap-2 text-[15px] font-semibold text-text-1">
            <FolderTree className="size-4 text-primary" aria-hidden="true" />
            Sumber Folder Drive (Arsip PKWT)
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-text-2">
            Tentukan root folder Google Drive tempat dokumen PKWT disimpan (struktur arsip:{" "}
            <code className="rounded bg-surface-3 px-1 font-mono text-xs">
              &lt;root&gt;/&lt;Bulan Tahun&gt;/&lt;KODE PERUSAHAAN&gt;/&lt;file&gt;
            </code>
            ). Anda bisa menempel link lengkap atau ID folder.
          </p>
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="space-y-2" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-10 rounded-md motion-reduce:animate-none" />
            ))}
          </div>
        ) : loadError ? (
          <div className="rounded-md border border-border bg-surface-2 p-4 text-sm" role="alert">
            <p className="font-semibold text-text-1">Gagal memuat konfigurasi folder root</p>
            <p className="mt-1 text-text-2">{loadError}, muat ulang halaman untuk mencoba lagi.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Tabel Roots */}
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">Label Folder</TableHead>
                    <TableHead className="min-w-[260px]">Folder ID atau URL Google Drive</TableHead>
                    <TableHead className="w-[150px]">Mulai Dari Bulan</TableHead>
                    <TableHead className="w-[90px] text-center">Aktif</TableHead>
                    <TableHead className="w-[220px]">Tes Akses &amp; Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roots.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-sm text-text-2">
                        Belum ada folder root yang ditambahkan. Klik &quot;Tambah Root Folder&quot; di bawah.
                      </TableCell>
                    </TableRow>
                  ) : (
                    roots.map((r, i) => {
                      const status = testStatus[i];
                      return (
                        <TableRow key={i}>
                          <TableCell className="align-top">
                            <Input
                              value={r.label || ""}
                              onChange={(e) => updateRoot(i, "label", e.target.value)}
                              placeholder="cth: HRIS PKWT"
                              className="h-10 text-sm font-medium"
                            />
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="space-y-1.5">
                              <Input
                                value={r.folder_id || ""}
                                onChange={(e) => updateRoot(i, "folder_id", e.target.value)}
                                placeholder="Paste link folder Drive atau ID"
                                className="h-10 font-mono text-xs"
                              />
                              {status?.loading && (
                                <p className="flex items-center gap-1.5 text-xs text-text-2">
                                  <Loader2 className="size-3.5 animate-spin text-primary" />
                                  Memeriksa akses ke Google Drive...
                                </p>
                              )}
                              {status?.success && (
                                <div className="flex items-center gap-1.5 rounded bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">
                                  <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />
                                  <span>
                                    Folder terverifikasi: <strong>&quot;{status.name}&quot;</strong>
                                  </span>
                                </div>
                              )}
                              {status?.error && (
                                <div className="flex items-start gap-1.5 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
                                  <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-red-600" />
                                  <span>{status.error}</span>
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            <Input
                              value={r.mulai_dari_bulan || ""}
                              onChange={(e) => updateRoot(i, "mulai_dari_bulan", e.target.value)}
                              placeholder="cth: 2024-01"
                              className="h-10 font-mono text-xs"
                            />
                            <p className="mt-1 text-[11px] text-text-2">Opsional (YYYY-MM)</p>
                          </TableCell>
                          <TableCell className="text-center align-top pt-3">
                            <input
                              type="checkbox"
                              checked={r.aktif !== false}
                              onChange={(e) => updateRoot(i, "aktif", e.target.checked)}
                              className="size-4 rounded border-border text-primary focus:ring-primary"
                              aria-label={`Status aktif untuk ${r.label}`}
                            />
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="flex items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => testAccess(i)}
                                disabled={status?.loading || !r.folder_id}
                                className="h-9 text-xs"
                              >
                                {status?.loading ? (
                                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                                ) : (
                                  <FolderCheck className="mr-1.5 size-3.5 text-emerald-600" />
                                )}
                                Tes akses
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeRootRow(i)}
                                className="h-9 px-2 text-text-2 hover:bg-red-50 hover:text-red-700"
                                aria-label={`Hapus ${r.label}`}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addRootRow}
                className="h-9 gap-1.5 text-xs text-text-1"
              >
                <Plus className="size-3.5" />
                Tambah Root Folder
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={saveAll}
                disabled={saving || scanning}
                className="h-9 min-w-[160px] text-xs font-medium"
              >
                {saving ? <Loader2 className="mr-2 size-3.5 animate-spin" /> : <Save className="mr-2 size-3.5" />}
                Simpan Sumber Folder
              </Button>
            </div>

            {/* Editor Pengecualian (Exclusions) */}
            <div className="rounded-md border border-border bg-surface-0/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-text-1">
                    Daftar Pola Pengecualian Nama File
                  </h3>
                  <p className="mt-0.5 text-xs text-text-2">
                    File yang memuat kata/pola ini akan dilewati dan tidak diidentifikasi sebagai kontrak PKWT.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetDefaultExclusions}
                  className="h-8 text-xs text-text-2 hover:text-text-1"
                >
                  <RefreshCw className="mr-1 size-3" />
                  Default
                </Button>
              </div>

              {/* Tag pills */}
              <div className="mt-3 flex flex-wrap gap-2">
                {exclusions.map((pola, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-1 px-2.5 py-1 text-xs font-medium text-text-1 shadow-xs"
                  >
                    <span>{pola}</span>
                    <button
                      type="button"
                      onClick={() => removeExclusion(idx)}
                      className="rounded p-0.5 text-text-2 hover:bg-surface-2 hover:text-red-600 focus:outline-hidden"
                      aria-label={`Hapus pola ${pola}`}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>

              {/* Form Tambah Pola */}
              <div className="mt-3 flex max-w-sm gap-2">
                <Input
                  value={newExclusion}
                  onChange={(e) => setNewExclusion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addExclusion();
                    }
                  }}
                  placeholder="Ketik pola baru..."
                  className="h-9 text-xs"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={addExclusion}
                  disabled={!newExclusion.trim()}
                  className="h-9 shrink-0 text-xs"
                >
                  <Plus className="mr-1 size-3.5" />
                  Tambah
                </Button>
              </div>
            </div>

            {/* ============================================================= */}
            {/* PANEL PEMINDAI FOLDER (Tahap 2: Dry-Run & Execute)           */}
            {/* ============================================================= */}
            <div className="rounded-lg border border-border bg-surface-1 p-5 shadow-xs">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-text-1">
                    <FileSearch className="size-4 text-emerald-600" />
                    Pemindai Folder Arsip PKWT
                  </h3>
                  <p className="mt-1 text-xs text-text-2">
                    Telusuri semua tingkat folder arsip (maksimal 6 tingkat), ekstrak nomor surat, nama, kode
                    perusahaan, serta tanggal mulai/berakhir dari isi kontrak secara bertahap.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {scanning ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      onClick={handleStop}
                      className="h-9 gap-1.5 text-xs"
                    >
                      <StopCircle className="size-4" />
                      Hentikan
                    </Button>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => runScan("dry-run")}
                        disabled={saving}
                        className="h-9 gap-1.5 border-border bg-surface-1 text-xs font-medium text-text-1 hover:bg-surface-2"
                      >
                        <Play className="size-3.5 text-amber-600" />
                        Dry-Run (Simulasi)
                      </Button>

                      <Button
                        type="button"
                        size="sm"
                        onClick={() => runScan("execute")}
                        disabled={saving}
                        className="h-9 gap-1.5 bg-primary text-xs font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        <RefreshCw className="size-3.5" />
                        Sinkron dari Drive
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Status Progres Saat Pemindaian Berjalan */}
              {scanning && (
                <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50/70 p-4 text-xs text-emerald-900">
                  <div className="flex items-center justify-between font-medium">
                    <span className="flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin text-emerald-700" />
                      {scanProgress.message}
                    </span>
                    <span className="rounded bg-emerald-200/80 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                      Mode: {scanMode === "dry-run" ? "Dry-Run" : "Execute"}
                    </span>
                  </div>

                  {/* Progress Stats bar */}
                  <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-5">
                    <div className="rounded border border-emerald-200/60 bg-white/80 p-2">
                      <span className="text-[11px] text-text-2">Dipindai</span>
                      <p className="text-base font-bold text-text-1">{scanProgress.scanned}</p>
                    </div>
                    <div className="rounded border border-emerald-200/60 bg-white/80 p-2">
                      <span className="text-[11px] text-text-2">
                        {scanMode === "execute" ? "Disimpan" : "Valid"}
                      </span>
                      <p className="text-base font-bold text-emerald-700">{scanProgress.saved}</p>
                    </div>
                    <div className="rounded border border-emerald-200/60 bg-white/80 p-2">
                      <span className="text-[11px] text-text-2">Dilewati</span>
                      <p className="text-base font-bold text-slate-600">{scanProgress.skipped}</p>
                    </div>
                    <div className="rounded border border-emerald-200/60 bg-white/80 p-2">
                      <span className="text-[11px] text-text-2">Perlu Dicek</span>
                      <p className="text-base font-bold text-amber-600">{scanProgress.needsCheck}</p>
                    </div>
                    <div className="rounded border border-emerald-200/60 bg-white/80 p-2">
                      <span className="text-[11px] text-text-2">Nama Tak Cocok</span>
                      <p className="text-base font-bold text-red-600">{scanProgress.unmatched}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Laporan Akhir Pemindaian */}
              {scanReport && !scanning && (
                <div className="mt-4 space-y-4">
                  {/* Banner Status Dry-run vs Execute */}
                  {scanReport.mode === "dry-run" ? (
                    <div className="flex flex-col gap-3 rounded-md border border-amber-200 bg-amber-50/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-2.5">
                        <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                        <div>
                          <p className="text-xs font-semibold text-amber-900">
                            Laporan Simulasi Dry-Run Selesai
                          </p>
                          <p className="mt-0.5 text-xs text-amber-800">
                            Data di bawah adalah hasil pratinjau dan <strong>belum disimpan</strong> ke tabel{" "}
                            <code className="font-mono font-semibold">pkwt_source</code>. Klik tombol di kanan untuk
                            mengeksekusi penyimpanan.
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => runScan("execute")}
                        className="h-8 shrink-0 bg-emerald-700 text-xs font-medium text-white hover:bg-emerald-800"
                      >
                        <RefreshCw className="mr-1.5 size-3" />
                        Jalankan Eksekusi Sekarang
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2.5 rounded-md border border-emerald-200 bg-emerald-50/80 p-3 text-xs text-emerald-900">
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                      <div>
                        <p className="font-semibold">Sinkronisasi Selesai Dieksekusi</p>
                        <p className="mt-0.5 text-emerald-800">
                          Sebanyak {scanReport.totalSaved} dokumen PKWT berhasil disimpan/diperbarui ke tabel{" "}
                          <code className="font-mono">pkwt_source</code>. Dokumen dengan tanda{" "}
                          <code className="font-mono">perlu_dicek</code> memerlukan verifikasi data manual.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Ringkasan Angka */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                    <div className="rounded-md border border-border bg-surface-0 p-3 text-center">
                      <span className="text-xs text-text-2">Total Dipindai</span>
                      <p className="mt-1 text-xl font-bold text-text-1">{scanReport.totalScanned}</p>
                    </div>
                    <div className="rounded-md border border-border bg-surface-0 p-3 text-center">
                      <span className="text-xs text-text-2">
                        {scanReport.mode === "execute" ? "Disimpan" : "Akan Disimpan"}
                      </span>
                      <p className="mt-1 text-xl font-bold text-emerald-600">{scanReport.totalSaved}</p>
                    </div>
                    <div className="rounded-md border border-border bg-surface-0 p-3 text-center">
                      <span className="text-xs text-text-2">Perlu Dicek</span>
                      <p className="mt-1 text-xl font-bold text-amber-600">{scanReport.totalNeedsCheck}</p>
                    </div>
                    <div className="rounded-md border border-border bg-surface-0 p-3 text-center">
                      <span className="text-xs text-text-2">Dilewati</span>
                      <p className="mt-1 text-xl font-bold text-slate-600">{scanReport.totalSkipped}</p>
                    </div>
                    <div className="rounded-md border border-border bg-surface-0 p-3 text-center">
                      <span className="text-xs text-text-2">Nama Tak Cocok</span>
                      <p className="mt-1 text-xl font-bold text-red-600">{scanReport.totalUnmatched}</p>
                    </div>
                  </div>

                  {/* Navigasi Tab Laporan Rincian */}
                  <div className="border-b border-border">
                    <div className="flex space-x-2">
                      <button
                        type="button"
                        onClick={() => setActiveReportTab("needsCheck")}
                        className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                          activeReportTab === "needsCheck"
                            ? "border-amber-600 text-amber-700 font-semibold"
                            : "border-transparent text-text-2 hover:text-text-1"
                        }`}
                      >
                        Perlu Dicek ({scanReport.needsCheckItems.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveReportTab("unmatched")}
                        className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                          activeReportTab === "unmatched"
                            ? "border-red-600 text-red-700 font-semibold"
                            : "border-transparent text-text-2 hover:text-text-1"
                        }`}
                      >
                        Nama Tak Cocok ({scanReport.unmatchedItems.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveReportTab("skipped")}
                        className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                          activeReportTab === "skipped"
                            ? "border-slate-600 text-slate-700 font-semibold"
                            : "border-transparent text-text-2 hover:text-text-1"
                        }`}
                      >
                        Alasan Dilewati ({Object.keys(scanReport.skippedByReason).length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveReportTab("items")}
                        className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                          activeReportTab === "items"
                            ? "border-primary text-primary font-semibold"
                            : "border-transparent text-text-2 hover:text-text-1"
                        }`}
                      >
                        Dokumen Terproses ({scanReport.processedItems.length})
                      </button>
                    </div>
                  </div>

                  {/* Isi Tab Rincian */}
                  <div className="max-h-[360px] overflow-y-auto rounded-md border border-border bg-surface-0/50 p-3">
                    {/* Tab 1: Perlu Dicek */}
                    {activeReportTab === "needsCheck" && (
                      <div className="space-y-2">
                        {scanReport.needsCheckItems.length === 0 ? (
                          <p className="py-4 text-center text-xs text-text-2">
                            Tidak ada dokumen yang perlu dicek. Semua format dan tanggal berhasil dikenali!
                          </p>
                        ) : (
                          scanReport.needsCheckItems.map((nc, idx) => (
                            <div
                              key={idx}
                              className="flex flex-col gap-1 rounded border border-amber-200/80 bg-amber-50/50 p-2 text-xs text-amber-950 sm:flex-row sm:items-center sm:justify-between"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-text-1">
                                  {nc.nomor_surat || "(Tanpa nomor)"} — {nc.nama_asli}
                                </p>
                                <p className="mt-0.5 text-amber-800">Alasan: {nc.alasan_cek}</p>
                              </div>
                              <a
                                href={`https://docs.google.com/document/d/${nc.file_id}/edit`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:underline"
                              >
                                Buka Doc <ExternalLink className="size-3" />
                              </a>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* Tab 2: Nama Tak Cocok */}
                    {activeReportTab === "unmatched" && (
                      <div className="space-y-2">
                        {scanReport.unmatchedItems.length === 0 ? (
                          <p className="py-4 text-center text-xs text-text-2">
                            Semua nama karyawan cocok dengan data master!
                          </p>
                        ) : (
                          scanReport.unmatchedItems.map((um, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between rounded border border-red-200 bg-red-50/50 p-2 text-xs text-red-950"
                            >
                              <div>
                                <p className="font-semibold text-text-1">{um.nama_asli}</p>
                                <p className="text-[11px] text-text-2">
                                  Nomor: {um.nomor_surat || "-"} | Key: <code>{um.nama_key}</code>
                                </p>
                              </div>
                              <span className="rounded bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
                                Tidak ada di Master
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* Tab 3: Alasan Dilewati */}
                    {activeReportTab === "skipped" && (
                      <div className="space-y-2">
                        {Object.keys(scanReport.skippedByReason).length === 0 ? (
                          <p className="py-4 text-center text-xs text-text-2">Tidak ada file yang dilewati.</p>
                        ) : (
                          <div className="divide-y divide-border">
                            {Object.entries(scanReport.skippedByReason).map(([reason, count], idx) => (
                              <div key={idx} className="flex items-center justify-between py-2 text-xs">
                                <span className="text-text-1">{reason}</span>
                                <span className="rounded-full bg-surface-2 px-2.5 py-0.5 font-mono text-xs font-semibold text-text-2">
                                  {count} file
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Tab 4: Dokumen Terproses */}
                    {activeReportTab === "items" && (
                      <div className="space-y-2">
                        {scanReport.processedItems.length === 0 ? (
                          <p className="py-4 text-center text-xs text-text-2">Belum ada file terproses.</p>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs">Nomor Surat</TableHead>
                                <TableHead className="text-xs">Karyawan</TableHead>
                                <TableHead className="text-xs">Lini / Perusahaan</TableHead>
                                <TableHead className="text-xs">Mulai s/d Selesai</TableHead>
                                <TableHead className="text-xs">Durasi</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {scanReport.processedItems.slice(0, 50).map((it, idx) => (
                                <TableRow key={idx}>
                                  <TableCell className="font-mono text-xs font-medium text-text-1">
                                    <a
                                      href={`https://docs.google.com/document/d/${it.file_id}/edit`}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="hover:underline text-primary"
                                    >
                                      {it.nomor_surat || "(Dokumen)"}
                                    </a>
                                  </TableCell>
                                  <TableCell className="text-xs">{it.nama_asli || "-"}</TableCell>
                                  <TableCell className="font-mono text-xs text-text-2">
                                    {it.kode_perusahaan || "-"}
                                  </TableCell>
                                  <TableCell className="text-xs font-mono">
                                    {it.tanggal_mulai && it.tanggal_berakhir
                                      ? `${it.tanggal_mulai} s/d ${it.tanggal_berakhir}`
                                      : it.perlu_dicek
                                      ? "Perlu dicek"
                                      : "-"}
                                  </TableCell>
                                  <TableCell className="text-xs">
                                    {it.jangka_bulan ? `${it.jangka_bulan} bln` : "-"}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
