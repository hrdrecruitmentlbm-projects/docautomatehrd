"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { FolderOpen, ArrowRight, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

// Settings > "Migrasi Arsip PKWT" (alat sekali pakai): pindahkan PKWT lama
// yang masih rata di folder root ke struktur <root>/<Bulan Tahun>/<KODE>.
//
// Alur aman: Dry-run dulu (read-only, tidak membuat apa pun) -> periksa
// laporan -> "Jalankan Migrasi" (ada confirm). Perpindahan hanya re-parent:
// ID & URL dokumen tidak pernah berubah, semua link lama tetap hidup.

const ACTION_LABEL = { move: "akan pindah", moved: "pindah", skip: "lewati", failed: "gagal" };
const ACTION_CLASS = {
  move: "border-border text-blue-600",
  moved: "border-border text-emerald-600",
  skip: "border-border text-text-2",
  failed: "border-red-500/50 text-red-600",
};
const SUMMARY_LABEL = {
  move: "Akan pindah",
  moved: "Berhasil pindah",
  skip: "Dilewati",
  failed: "Gagal",
};

// Samakan dengan Input (ui/input.jsx) supaya select terlihat seragam.
const SELECT_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

async function callMigrate(payload) {
  const res = await fetch("/api/migrate-archive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request gagal (HTTP ${res.status})`);
  return data;
}

export function MigrateArchive() {
  const [report, setReport] = useState(null); // hasil dry-run terakhir (masih berlaku)
  const [execResult, setExecResult] = useState(null); // hasil execute
  const [rootsList, setRootsList] = useState([]); // akar root terdeteksi (untuk select)
  const [scope, setScope] = useState("all"); // "all" | <folder ID>
  const [target, setTarget] = useState("inplace"); // "inplace" | <folder ID>
  const [busy, setBusy] = useState(null); // "dry" | "exec"

  const result = execResult || report;
  const moveCount = report?.summary?.move ?? null;

  // Mengubah parameter membuat laporan basi -> execute dikunci sampai dry-run ulang.
  const changeParam = (setter) => (e) => {
    setter(e.target.value);
    setReport(null);
    setExecResult(null);
  };

  const runDry = async () => {
    setBusy("dry");
    setExecResult(null);
    try {
      const payload = { mode: "dry-run" };
      if (scope !== "all") payload.rootFolderId = scope;
      const d = await callMigrate(payload);
      setReport(d);
      setRootsList(d.roots || []);
      if (d.summary.move === 0) toast.info("Dry-run selesai: tidak ada file untuk dipindahkan.");
      else toast.success(`Dry-run selesai: ${d.summary.move} file siap dipindah.`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  const runExec = async () => {
    if (!report) return;
    const ok = window.confirm(
      `Pindahkan ${report.summary.move} file sekarang? ` +
        "ID dan URL dokumen tidak berubah — semua link lama tetap hidup."
    );
    if (!ok) return;
    setBusy("exec");
    try {
      const payload = { mode: "execute" };
      if (scope !== "all") payload.rootFolderId = scope;
      if (target !== "inplace") payload.targetRootFolderId = target;
      const d = await callMigrate(payload);
      setExecResult(d);
      setReport(null); // laporan basi setelah file berpindah
      setRootsList(d.roots || rootsList);
      if (d.summary.failed > 0) {
        toast.error(`${d.summary.failed} file gagal dipindah — lihat rincian di bawah.`);
      } else {
        toast.success(`${d.summary.moved} file berhasil dipindah ke arsip.`);
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };

  const configProblems =
    (report?.invalidRoots?.length || 0) + (report?.rootErrors?.length || 0) > 0 ||
    (execResult?.invalidRoots?.length || 0) + (execResult?.rootErrors?.length || 0) > 0;
  const problems = execResult || report;

  return (
    <section aria-labelledby="migrasi-arsip" className="p-5 sm:p-6">
      <h2 id="migrasi-arsip" className="text-[15px] font-semibold text-text-1">
        Migrasi Arsip PKWT
      </h2>
      <p className="mt-1 text-sm text-text-2">
        Alat sekali pakai: pindahkan dokumen PKWT lama yang masih rata di folder root ke struktur{" "}
        <span className="font-mono text-text-1">Folder Root/&lt;Bulan Tahun&gt;/&lt;KODE&gt;</span>{" "}
        (contoh: <span className="font-mono text-text-1">HRIS PKWT/September 2026/MJO</span>). Dokumen baru
        otomatis mengikuti struktur ini tanpa perlu migrasi.
      </p>

      {/* Pilihan root — hanya muncul bila terdeteksi lebih dari satu folder root. */}
      {rootsList.length > 1 && (
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="mig-scope">Cakupan folder root</Label>
            <select id="mig-scope" className={cn(SELECT_CLASS)} value={scope} onChange={changeParam(setScope)}>
              <option value="all">Semua root ({rootsList.length} terdeteksi)</option>
              {rootsList.map((r) => (
                <option key={r.id} value={r.id}>
                  Hanya: {r.name || r.id}
                </option>
              ))}
            </select>
            <p className="text-xs text-text-2">Pilih satu root bila ingin memproses hanya folder itu.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mig-target">Tujuan arsip</Label>
            <select id="mig-target" className={cn(SELECT_CLASS)} value={target} onChange={changeParam(setTarget)}>
              <option value="inplace">Di tempat (masing-masing root)</option>
              {rootsList.map((r) => (
                <option key={r.id} value={r.id}>
                  Kumpulkan ke: {r.name || r.id}
                </option>
              ))}
            </select>
            <p className="text-xs text-text-2">
              &ldquo;Kumpulkan ke&rdquo; menarik semua file ke satu root (biasanya HRIS PKWT).
            </p>
          </div>
        </div>
      )}

      {/* Aksi */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" onClick={runDry} disabled={!!busy}>
          {busy === "dry" ? <Loader2 className="animate-spin" /> : <FolderOpen />}
          {report ? "Ulangi Dry-run" : "1. Dry-run (Baca Saja)"}
        </Button>
        <Button type="button" onClick={runExec} disabled={!report || !!busy || moveCount === 0}>
          {busy === "exec" ? <Loader2 className="animate-spin" /> : <ArrowRight />}
          2. Jalankan Migrasi
        </Button>
        {report && (
          <span className="text-sm text-text-2">
            {moveCount} file siap dipindah &middot; {report.summary.skip} dilewati
            {moveCount > 0 && " — periksa rincian di bawah sebelum menjalankan."}
          </span>
        )}
        {!report && !execResult && (
          <span className="text-sm text-text-2">Jalankan dry-run dulu untuk melihat laporan (tanpa perubahan).</span>
        )}
      </div>

      {/* Masalah konfigurasi root (ID rusak / duplikat) */}
      {configProblems && (
        <div className="mt-4 space-y-1.5 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-600">
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="size-4" /> Konfigurasi folder root bermasalah:
          </p>
          {(problems.invalidRoots || []).map((r, i) => (
            <p key={`inv-${i}`} className="pl-6">
              <span className="font-medium">{r.source}</span>: &ldquo;{r.value}&rdquo; bukan ID/URL Drive yang
              valid — perbaiki di Settings / Data &rarr; Pemetaan.
            </p>
          ))}
          {(problems.rootErrors || []).map((r, i) => (
            <p key={`err-${i}`} className="pl-6">
              <span className="font-medium">{r.sources?.join(", ") || r.id}</span>
              {r.name ? ` (${r.name})` : ""}: {r.error}
            </p>
          ))}
        </div>
      )}

      {/* Root terdeteksi */}
      {result?.roots?.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm">
          {result.roots.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-text-2">
              <FolderOpen className="size-3.5 shrink-0" />
              <span className="font-medium text-text-1">{r.name || r.id}</span>
              <span>{r.files} file</span>
              {r.sources?.length > 0 && <span className="font-mono text-xs">({r.sources.join(", ")})</span>}
            </li>
          ))}
          {result.targetRoot && (
            <li className="flex flex-wrap items-center gap-x-2 text-text-2">
              <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />
              Semua file dikumpulkan ke:{" "}
              <span className="font-medium text-text-1">{result.targetRoot.name || result.targetRoot.id}</span>
            </li>
          )}
        </ul>
      )}

      {/* Ringkasan + rincian per file */}
      {result?.items?.length > 0 && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            {Object.entries(result.summary)
              .filter(([, v]) => v > 0)
              .map(([k, v]) => (
                <span
                  key={k}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs",
                    k === "failed" && "border-red-500/50 text-red-600",
                    k === "moved" && "border-border text-emerald-600",
                    (k === "move" || k === "skip") && "border-border text-text-2"
                  )}
                >
                  {SUMMARY_LABEL[k] || k}: {v}
                </span>
              ))}
          </div>
          <div className="max-h-72 overflow-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-surface-1 text-left text-xs text-text-2">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Aksi
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    File
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Tujuan / Alasan
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((it) => (
                  <tr key={it.id} className="border-t border-border align-top">
                    <td className="px-3 py-1.5 whitespace-nowrap">
                      <span className={cn("rounded-md border px-1.5 py-0.5 text-xs", ACTION_CLASS[it.action])}>
                        {ACTION_LABEL[it.action] || it.action}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-text-1">{it.name}</td>
                    <td className="px-3 py-1.5 text-text-2">
                      {it.targetPath || it.error || it.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
