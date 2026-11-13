"use client";
import { readJson } from "@/lib/http";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, Loader2, RefreshCw, Stethoscope, TableProperties, XCircle, RotateCcw, AlertTriangle } from "lucide-react";

function formatSyncTime(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (isNaN(d)) return null;
  return (
    new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d) + " WIB"
  );
}

/**
 * Data page sections 1 (Master) and 2 (Payroll), hairline sections inside
 * the page's single panel (no Card wrappers; one panel, many sections).
 *
 * Feedback policy: toasts carry only the short async outcome; the inline
 * result boxes carry the persistent detail (counts, failures, dupes).
 * Diagnosa lives in a collapsed <details> (progressive disclosure), it is
 * not a competing primary action.
 */
export function SheetsSync({
  initialMasterUrl = "",
  initialMasterTab = "",
  initialPayrollFolder = "",
  initialPayrollTab = "",
  initialLastMasterSync = null,
  payrollLocked = false,
}) {
  const router = useRouter();
  const [masterUrl, setMasterUrl] = useState(initialMasterUrl);
  const [lastMasterSync, setLastMasterSync] = useState(initialLastMasterSync);
  const [tabs, setTabs] = useState(initialMasterTab ? [{ title: initialMasterTab, sheetId: null }] : []);
  const [tab, setTab] = useState(initialMasterTab);
  const [loadingTabs, setLoadingTabs] = useState(false);
  const [busyMaster, setBusyMaster] = useState(false);
  const [masterProgress, setMasterProgress] = useState(null);
  const [masterResult, setMasterResult] = useState(null);
  const [failedRanges, setFailedRanges] = useState([]);
  const [lastProbe, setLastProbe] = useState(null);
  const [retrying, setRetrying] = useState(false);
  const [busyDiag, setBusyDiag] = useState(false);
  const [diagSteps, setDiagSteps] = useState(null);
  const diagRef = useRef(null);

  const [payrollFolder, setPayrollFolder] = useState(initialPayrollFolder);
  const [payrollTabs, setPayrollTabs] = useState(initialPayrollTab ? [{ title: initialPayrollTab, sheetId: null }] : []);
  const [payrollTab, setPayrollTab] = useState(initialPayrollTab);
  const [loadingPayrollTabs, setLoadingPayrollTabs] = useState(false);
  const [payrollPeriode, setPayrollPeriode] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [busyPayroll, setBusyPayroll] = useState(false);
  const [payrollResult, setPayrollResult] = useState(null);
  const periodeValid = /^\d{4}-\d{2}$/.test(payrollPeriode);

  // Auto-open the diagnosis details when a run lands results.
  useEffect(() => {
    if (diagSteps && diagRef.current) diagRef.current.open = true;
  }, [diagSteps]);

  const loadTabs = async () => {
    if (!masterUrl.trim()) return;
    setLoadingTabs(true);
    try {
      const res = await fetch(`/api/sheet-tabs?spreadsheetId=${encodeURIComponent(masterUrl.trim())}`);
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || "Gagal membaca daftar tab");
      setTabs(data.tabs || []);
      const pre = data.suggestedTab || data.tabs?.[0]?.title;
      if (pre && !data.tabs?.some((t) => t.title === tab)) setTab(pre);
      if ((data.tabs || []).length === 0) toast.warning("Spreadsheet tidak punya tab");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoadingTabs(false);
    }
  };

  const runDiagnosis = async () => {
    if (!masterUrl.trim()) return;
    setBusyDiag(true);
    setDiagSteps(null);
    try {
      const qs = new URLSearchParams({ sheetUrl: masterUrl.trim() });
      if (tab) qs.set("tab", tab);
      const res = await fetch(`/api/diagnose?${qs.toString()}`);
      const data = await readJson(res);
      setDiagSteps(data.steps || []);
      const failed = (data.steps || []).find((s) => !s.ok);
      if (failed) toast.error(`Gagal di langkah: ${failed.name}`);
      else toast.success("Semua langkah diagnosa lulus");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusyDiag(false);
    }
  };

  const syncMaster = async () => {
    if (!masterUrl.trim()) return;
    setBusyMaster(true);
    setMasterResult(null);
    setDiagSteps(null);
    setFailedRanges([]);
    setMasterProgress({ done: 0, total: 0 });
    try {
      // Retries a flaky network instead of aborting the whole sync.
      const post = async (payload, attempt = 0) => {
        try {
          const res = await fetch("/api/sync-master", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            // 4xx = real problem (won't heal by waiting)
            if (res.status >= 500 && attempt < 2) throw new Error("__retry__");
            throw new Error(data.error || `Gagal sinkron master (HTTP ${res.status})`);
          }
          return data;
        } catch (e) {
          if (e.message === "__retry__" || /fetch failed|network|Failed to fetch/i.test(e.message || "")) {
            if (attempt < 2) {
              await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
              return post(payload, attempt + 1);
            }
          }
          throw e;
        }
      };
      // 1. Probe: header + row count (tiny reads)
      const probe = await post({ sheetUrl: masterUrl.trim(), tab: tab || undefined, probe: true });
      if (probe.tabs) setTabs(probe.tabs);
      if (probe.tab) setTab(probe.tab);
      setLastProbe({ sheetUrl: masterUrl.trim(), tab: probe.tab, headers: probe.headerRow });
      const CHUNK = 40;
      let synced = 0;
      let consumed = 0;
      const failed = [];
      const dupes = [];
      const needingExpiry = [];
      let syncWarning = null;
      const liniSet = new Set();
      const total = probe.totalRows || 0;
      // 2. Sync 40 rows at a time; a broken chunk is skipped, not fatal
      for (let guard = 0; guard < 200; guard++) {
        const start = probe.headerIndex + 1 + consumed;
        try {
          const r = await post({
            sheetUrl: masterUrl.trim(),
            tab: probe.tab,
            headers: probe.headerRow,
            startRow: start,
            endRow: start + CHUNK - 1,
          });
          synced += r.synced || 0;
          for (const d of r.duplicates || []) if (!dupes.includes(d)) dupes.push(d);
          for (const p of r.perluDilengkapi || []) {
            if (!needingExpiry.some((x) => x.nama === p.nama)) needingExpiry.push(p);
          }
          if (r.warning && !syncWarning) syncWarning = r.warning;
          for (const lb of r.liniBisnis || []) liniSet.add(lb);
        } catch (e) {
          failed.push({ start, end: start + CHUNK - 1, message: e.message || String(e) });
        }
        consumed += CHUNK;
        setMasterProgress({ done: Math.min(consumed, Math.max(total, 1)), total: Math.max(total, 1) });
        // Stop at an empty window past the estimate, or one window past it.
        if (consumed >= total + CHUNK) break;
        if (failed.length > 5) break;
      }
      // 3. Save links once (like Template IDs) so next visit is pre-filled.
      let lastSync = new Date().toISOString();
      try {
        const s = await post({ sheetUrl: masterUrl.trim(), tab: probe.tab, saveOnly: true });
        if (s.persistHint) toast.warning(s.persistHint);
        if (s.lastSyncAt) lastSync = s.lastSyncAt;
      } catch {
        // Non-fatal: sync already succeeded.
      }
      setLastMasterSync(lastSync);
      setMasterResult({
        total: synced,
        tab: probe.tab,
        duplicates: dupes,
        perluDilengkapi: needingExpiry,
        distinctLiniBisnis: [...liniSet].sort(),
        warning: syncWarning,
        lastSyncAt: lastSync,
      });
      setFailedRanges(failed);
      // Toast = short outcome only; the result box carries the detail.
      if (failed.length === 0) toast.success(`${synced} karyawan tersimpan`);
      else toast.warning(`${synced} tersimpan, ${failed.length} bagian gagal`);
      if (dupes.length > 0) toast.warning(`${dupes.length} nama ganda di Sheet (disimpan 1x)`);
      if (needingExpiry.length > 0) toast.warning(`${needingExpiry.length} karyawan PKWT/Freelance/Training belum ada tanggal habis kontrak`);
      router.refresh();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusyMaster(false);
      setMasterProgress(null);
    }
  };

  // Per-chunk retry: re-post ONLY the failed ranges instead of a full re-sync.
  const retryFailed = async () => {
    if (!lastProbe || failedRanges.length === 0) return;
    setRetrying(true);
    try {
      let recovered = 0;
      const stillFailed = [];
      const recoveredNeeding = [];
      for (const range of failedRanges) {
        try {
          const res = await fetch("/api/sync-master", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sheetUrl: lastProbe.sheetUrl,
              tab: lastProbe.tab,
              headers: lastProbe.headers,
              startRow: range.start,
              endRow: range.end,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
          recovered += data.synced || 0;
          for (const p of data.perluDilengkapi || []) {
            if (!recoveredNeeding.some((x) => x.nama === p.nama)) recoveredNeeding.push(p);
          }
        } catch (e) {
          stillFailed.push({ ...range, message: e.message || String(e) });
        }
      }
      setFailedRanges(stillFailed);
      setMasterResult((prev) => {
        if (!prev) return prev;
        const mergedNeeding = [...(prev.perluDilengkapi || [])];
        for (const p of recoveredNeeding) {
          if (!mergedNeeding.some((x) => x.nama === p.nama)) mergedNeeding.push(p);
        }
        return { ...prev, total: prev.total + recovered, perluDilengkapi: mergedNeeding };
      });
      if (stillFailed.length === 0) toast.success(`Bagian gagal tersimpan (+${recovered})`);
      else toast.error(`${stillFailed.length} bagian masih gagal`);
    } finally {
      setRetrying(false);
    }
  };

  const loadPayrollTabs = async () => {
    if (!payrollFolder.trim()) return;
    setLoadingPayrollTabs(true);
    try {
      const res = await fetch(`/api/sheet-tabs?spreadsheetId=${encodeURIComponent(payrollFolder.trim())}`);
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || "Gagal membaca daftar tab payroll");
      setPayrollTabs(data.tabs || []);
      const pre = data.suggestedTab || data.tabs?.[0]?.title;
      if (pre && !data.tabs?.some((t) => t.title === payrollTab)) setPayrollTab(pre);
      if ((data.tabs || []).length === 0) toast.warning("Spreadsheet payroll tidak punya tab");
      else toast.success(`Ditemukan ${(data.tabs || []).length} tab/sheet payroll`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoadingPayrollTabs(false);
    }
  };

  const syncPayroll = async () => {
    if (!payrollFolder.trim()) return;
    if (!periodeValid) return;
    setBusyPayroll(true);
    setPayrollResult(null);
    try {
      const res = await fetch("/api/sync-payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sheetUrl: payrollFolder.trim(),
          folderUrl: payrollFolder.trim(),
          tab: payrollTab || undefined,
          periode_bulan: payrollPeriode,
        }),
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || "Gagal sinkron payroll");
      setPayrollResult(data);
      const tabName = data.fileUsed?.tab ? ` (tab ${data.fileUsed.tab})` : "";
      toast.success(`${data.matched}/${data.total} payroll cocok (${data.periode_bulan})${tabName}`);
      if (data.unmatched?.length > 0) toast.warning(`${data.unmatched.length} nama tidak cocok, cek ejaan`);
      if (data.persistHint) toast.warning(data.persistHint);
      router.refresh();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusyPayroll(false);
    }
  };

  return (
    <>
      {/* Section 1: Master */}
      <section aria-labelledby="master-heading" className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="master-heading" className="text-[15px] font-semibold text-text-1">
            Database Master Karyawan
          </h2>
          {lastMasterSync && (
            <span className="text-xs text-text-2">
              Sinkron terakhir: {formatSyncTime(lastMasterSync)}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-text-2">
          Tempel link Google Sheet master, pilih tab, lalu Sync. Pastikan Sheet
          dibagikan ke email login Anda (Viewer cukup).
        </p>

        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="master-url">Link spreadsheet master</Label>
            <Input
              id="master-url"
              value={masterUrl}
              onChange={(e) => setMasterUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="h-10 font-mono text-xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={loadTabs} disabled={loadingTabs || !masterUrl.trim()} className="h-10">
              {loadingTabs ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <TableProperties className="w-4 h-4 mr-2" />}
              Muat Tab
            </Button>
            {tabs.length > 0 && (
              <Select value={tab} onValueChange={setTab}>
                <SelectTrigger className="h-10 min-w-[180px]"><SelectValue placeholder="Pilih tab..." /></SelectTrigger>
                <SelectContent>
                  {tabs.map((t) => (<SelectItem key={t.title} value={t.title}>{t.title}</SelectItem>))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {/* The page's ONE primary action */}
            <Button onClick={syncMaster} disabled={busyMaster || !masterUrl.trim()} className="h-10 min-w-[150px]">
              {busyMaster ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              {busyMaster ? "Sync Master..." : "Sync Master"}
            </Button>

            {/* Diagnosa: secondary + progressive disclosure (not a peer primary) */}
            <details ref={diagRef} className="group w-full sm:w-auto">
              <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-2 rounded-md border border-border bg-surface-1 px-3 text-sm font-medium text-text-1 transition-colors hover:bg-surface-2 [&::-webkit-details-marker]:hidden">
                <Stethoscope className="w-4 h-4" />
                Diagnosa
              </summary>
              <div className="mt-3 space-y-3">
                <Button variant="outline" onClick={runDiagnosis} disabled={busyDiag || !masterUrl.trim()} className="h-9">
                  {busyDiag ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Stethoscope className="w-4 h-4 mr-2" />}
                  Jalankan Diagnosa
                </Button>
                {diagSteps && (
                  <ul className="divide-y divide-border rounded-md border border-border text-xs">
                    {diagSteps.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 p-2.5">
                        {s.ok
                          ? <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
                          : <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />}
                        <div className="min-w-0">
                          <p className="font-medium text-text-1">
                            {i + 1}. {s.name} <span className="font-normal text-text-2">({s.ms} ms)</span>
                          </p>
                          <p className={`break-words ${s.ok ? "text-text-2" : "text-red-700"}`}>{s.detail}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </details>
          </div>

          {/* Determinate progress: bar + text share the value (color-not-only) */}
          {busyMaster && masterProgress && masterProgress.total > 0 && (
            <div
              role="progressbar"
              aria-label="Progres sinkron master"
              aria-valuemin={0}
              aria-valuemax={masterProgress.total}
              aria-valuenow={masterProgress.done}
              className="space-y-1.5"
            >
              <div className="flex justify-between text-xs tabular text-text-2">
                <span>Sync berjalan, aman ditinggal, lanjut otomatis</span>
                <span>{masterProgress.done}/{masterProgress.total}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${Math.round((masterProgress.done / masterProgress.total) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {masterResult && (
            <div className="space-y-3 rounded-md border border-border bg-surface-2 p-4 text-sm" role="status" aria-live="polite">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2">
                <p className="font-semibold text-text-1">
                  {masterResult.total} karyawan tersimpan (tab {masterResult.tab}).
                </p>
                {masterResult.lastSyncAt && (
                  <span className="text-xs text-text-2">
                    Sinkron: {formatSyncTime(masterResult.lastSyncAt)}
                  </span>
                )}
              </div>

              <p className="text-text-2">
                Lini bisnis: {masterResult.distinctLiniBisnis?.join(", ") || "-"}
              </p>

              {masterResult.warning && (
                <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                  {masterResult.warning}
                </div>
              )}

              {masterResult.perluDilengkapi?.length > 0 && (
                <div className="rounded-md border border-amber-300 bg-amber-50/80 p-3 text-xs text-amber-900">
                  <div className="flex items-start gap-1.5 font-medium text-amber-900">
                    <AlertTriangle className="size-4 shrink-0 text-amber-600 mt-0.5" />
                    <span>
                      {masterResult.perluDilengkapi.length} karyawan berstatus PKWT/FREELANCE/TRAINING belum memiliki tanggal habis kontrak di Sheet (perlu dilengkapi):
                    </span>
                  </div>
                  <details className="mt-2 group">
                    <summary className="cursor-pointer font-medium text-amber-800 hover:text-amber-950 underline underline-offset-2">
                      Lihat daftar nama ({masterResult.perluDilengkapi.length} orang)
                    </summary>
                    <div className="mt-2 max-h-48 overflow-y-auto rounded border border-amber-200 bg-white/70 p-2 space-y-1">
                      {masterResult.perluDilengkapi.map((emp, i) => (
                        <div key={i} className="flex items-center justify-between text-[11px] border-b border-amber-100 last:border-b-0 py-0.5">
                          <span className="font-mono font-medium text-slate-800">{emp.nama}</span>
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 font-semibold uppercase">
                            {emp.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              )}

              {masterResult.duplicates?.length > 0 && (
                <p className="text-amber-700">
                  Nama ganda di Sheet (tersimpan 1x): {masterResult.duplicates.slice(0, 10).join("; ")}
                  {masterResult.duplicates.length > 10 ? ` (+${masterResult.duplicates.length - 10} lagi)` : ""}
                </p>
              )}

              {failedRanges.length > 0 && (
                <div className="pt-2">
                  <p className="text-amber-700">
                    Gagal di {failedRanges.length} bagian:{" "}
                    {failedRanges.map((f) => `baris ${f.start}-${f.end}`).join("; ")}.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={retryFailed}
                    disabled={retrying || !lastProbe}
                    className="mt-2 h-9"
                  >
                    {retrying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-2" />}
                    Ulangi bagian gagal ({failedRanges.length})
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Section 2: Payroll */}
      <section aria-labelledby="payroll-heading" className="border-t border-border p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 id="payroll-heading" className="text-[15px] font-semibold text-text-1">
            Payroll Bulan Terbaru
          </h2>
          {payrollLocked && (
            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text-2">
              Setelah master tersinkron
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-text-2">
          Tempel link Google Sheet payroll, pilih tab/sheet, lalu Sync. Pastikan Sheet
          dibagikan ke email login Anda (Viewer cukup). Bisa juga link folder Drive.
        </p>

        <div className={`mt-4 space-y-4 ${payrollLocked ? "opacity-60" : ""}`} aria-disabled={payrollLocked || undefined}>
          <div className="space-y-1.5">
            <Label htmlFor="payroll-folder">
              Link spreadsheet payroll{" "}
              <span className="font-normal text-text-2">atau folder Drive</span>
            </Label>
            <Input
              id="payroll-folder"
              value={payrollFolder}
              onChange={(e) => setPayrollFolder(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/... atau https://drive.google.com/drive/folders/..."
              className="h-10 font-mono text-xs"
              disabled={payrollLocked}
            />
            <p className="text-xs text-text-2">
              {payrollLocked
                ? "Sinkron master dulu, payroll dicocokkan ke nama di master."
                : "Tempel link Google Sheet payroll lalu klik \"Muat Tab\" untuk memilih sheet yang akan dipakai. Bisa juga link folder Drive."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={loadPayrollTabs}
              disabled={loadingPayrollTabs || !payrollFolder.trim() || payrollLocked}
              className="h-10"
            >
              {loadingPayrollTabs ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <TableProperties className="w-4 h-4 mr-2" />
              )}
              Muat Tab
            </Button>
            {payrollTabs.length > 0 && (
              <Select value={payrollTab} onValueChange={setPayrollTab} disabled={payrollLocked}>
                <SelectTrigger className="h-10 min-w-[180px]">
                  <SelectValue placeholder="Pilih tab/sheet..." />
                </SelectTrigger>
                <SelectContent>
                  {payrollTabs.map((t) => (
                    <SelectItem key={t.title} value={t.title}>
                      {t.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payroll-periode">
              Periode bulan file payroll (YYYY-MM){" "}
              <span className="font-normal text-text-2">default: bulan ini</span>
            </Label>
            <Input
              id="payroll-periode"
              value={payrollPeriode}
              onChange={(e) => setPayrollPeriode(e.target.value)}
              placeholder="2026-11"
              className="h-10 font-mono"
              aria-invalid={!periodeValid || undefined}
              aria-describedby={periodeValid ? undefined : "payroll-periode-error"}
              disabled={payrollLocked}
            />
            {!periodeValid && (
              <p id="payroll-periode-error" className="text-xs text-red-700">
                Periode harus format YYYY-MM, contoh 2026-11.
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              onClick={syncPayroll}
              disabled={busyPayroll || !payrollFolder.trim() || payrollLocked || !periodeValid}
              className="h-10 min-w-[150px]"
            >
              {busyPayroll ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              {busyPayroll ? "Sync Payroll..." : "Sync Payroll"}
            </Button>
          </div>

          {payrollResult && (
            <div className="space-y-1 rounded-md border border-border bg-surface-2 p-4 text-sm" role="status" aria-live="polite">
              <p className="font-semibold text-text-1">
                {payrollResult.matched}/{payrollResult.total} payroll cocok ({payrollResult.periode_bulan})
                {payrollResult.fileUsed?.tab ? ` (tab ${payrollResult.fileUsed.tab})` : ""}.
              </p>
              {payrollResult.fileUsed?.name && (
                <p className="text-text-2">File: {payrollResult.fileUsed.name}</p>
              )}
              {payrollResult.unmatched?.length > 0 && (
                <p className="text-amber-700">
                  Tidak cocok: {payrollResult.unmatched.slice(0, 10).join("; ")}
                  {payrollResult.unmatched.length > 10 ? ` (+${payrollResult.unmatched.length - 10} lagi)` : ""}
                </p>
              )}
              {payrollResult.duplicates?.length > 0 && (
                <p className="text-amber-700">
                  Nama ganda di file payroll (tersimpan 1x): {payrollResult.duplicates.slice(0, 10).join("; ")}
                  {payrollResult.duplicates.length > 10 ? ` (+${payrollResult.duplicates.length - 10} lagi)` : ""}
                </p>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
