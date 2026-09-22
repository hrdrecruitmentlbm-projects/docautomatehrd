"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { CheckCircle2, Loader2, RefreshCw, Stethoscope, TableProperties, XCircle } from "lucide-react";

export function SheetsSync({ initialMasterUrl = "", initialMasterTab = "", initialPayrollFolder = "" }) {
  const [masterUrl, setMasterUrl] = useState(initialMasterUrl);
  const [tabs, setTabs] = useState(initialMasterTab ? [{ title: initialMasterTab, sheetId: null }] : []);
  const [tab, setTab] = useState(initialMasterTab);
  const [loadingTabs, setLoadingTabs] = useState(false);
  const [busyMaster, setBusyMaster] = useState(false);
  const [masterProgress, setMasterProgress] = useState(null);
  const [masterResult, setMasterResult] = useState(null);
  const [busyDiag, setBusyDiag] = useState(false);
  const [diagSteps, setDiagSteps] = useState(null);

  const [payrollFolder, setPayrollFolder] = useState(initialPayrollFolder);
  const [payrollPeriode, setPayrollPeriode] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [busyPayroll, setBusyPayroll] = useState(false);
  const [payrollResult, setPayrollResult] = useState(null);
  const payrollIsFile = payrollFolder.includes("/spreadsheets/d/");

  const loadTabs = async () => {
    if (!masterUrl.trim()) return toast.error("Tempel link spreadsheet master dulu");
    setLoadingTabs(true);
    try {
      const res = await fetch(`/api/sheet-tabs?spreadsheetId=${encodeURIComponent(masterUrl.trim())}`);
      const data = await res.json();
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
    if (!masterUrl.trim()) return toast.error("Tempel link spreadsheet master dulu");
    setBusyDiag(true);
    setDiagSteps(null);
    try {
      const qs = new URLSearchParams({ sheetUrl: masterUrl.trim() });
      if (tab) qs.set("tab", tab);
      const res = await fetch(`/api/diagnose?${qs.toString()}`);
      const data = await res.json();
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
    if (!masterUrl.trim()) return toast.error("Tempel link spreadsheet master dulu");
    setBusyMaster(true);
    setMasterResult(null);
    setDiagSteps(null);
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
      const CHUNK = 40;
      let synced = 0;
      let consumed = 0;
      const failedRanges = [];
      const dupes = [];
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
        } catch (e) {
          failedRanges.push(`baris ${start}-${start + CHUNK - 1}: ${e.message || e}`);
        }
        consumed += CHUNK;
        setMasterProgress({ done: Math.min(consumed, Math.max(total, 1)), total: Math.max(total, 1) });
        // Stop at an empty window past the estimate, or one window past it.
        if (consumed >= total + CHUNK) break;
        if (failedRanges.length > 5) break;
      }
      // 3. Save links once (like Template IDs) so next visit is pre-filled.
      try {
        const s = await post({ sheetUrl: masterUrl.trim(), tab: probe.tab, saveOnly: true });
        if (s.persistHint) toast.warning(s.persistHint);
      } catch {
        // Non-fatal: sync already succeeded.
      }
      setMasterResult({ total: synced, tab: probe.tab, failedRanges, duplicates: dupes });
      if (failedRanges.length === 0) {
        toast.success(`${synced} karyawan tersimpan`);
      } else {
        toast.warning(`${synced} tersimpan, tapi gagal: ${failedRanges.join(", ")}. Jalankan Sync lagi untuk ulangi bagian itu.`);
      }
      if (dupes.length > 0) {
        toast.warning(`${dupes.length} nama ganda di Sheet (disimpan 1x): ${dupes.slice(0, 5).join("; ")}${dupes.length > 5 ? "…" : ""}. Rapikan di Sheet bila perlu.`);
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusyMaster(false);
      setMasterProgress(null);
    }
  };

  const syncPayroll = async () => {
    if (!payrollFolder.trim()) return toast.error("Tempel link folder atau file payroll dulu");
    if (payrollIsFile && !/^\d{4}-\d{2}$/.test(payrollPeriode)) return toast.error("Periode harus YYYY-MM");
    setBusyPayroll(true);
    setPayrollResult(null);
    try {
      const res = await fetch("/api/sync-payroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payrollIsFile
          ? { sheetUrl: payrollFolder.trim(), periode_bulan: payrollPeriode }
          : { folderUrl: payrollFolder.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal sinkron payroll");
      setPayrollResult(data);
      toast.success(`${data.matched}/${data.total} payroll cocok (${data.periode_bulan})`);
      if (data.unmatched?.length > 0) toast.warning(`${data.unmatched.length} nama tidak cocok — cek ejaan`);
      if (data.persistHint) toast.warning(data.persistHint);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusyPayroll(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50">
          <CardTitle className="text-lg text-slate-800">1. Database Master Karyawan</CardTitle>
          <CardDescription>Tempel link Google Sheet master, pilih tab, lalu Sync. Pastikan Sheet dibagikan ke email login Anda (Viewer cukup).</CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="master-url">Link spreadsheet master</Label>
            <Input
              id="master-url"
              value={masterUrl}
              onChange={(e) => setMasterUrl(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              className="font-mono text-xs"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadTabs} disabled={loadingTabs || !masterUrl.trim()} className="shrink-0">
              {loadingTabs ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <TableProperties className="w-4 h-4 mr-2" />}
              Muat Tab
            </Button>
            {tabs.length > 0 && (
              <Select value={tab} onValueChange={setTab}>
                <SelectTrigger><SelectValue placeholder="Pilih tab..." /></SelectTrigger>
                <SelectContent>
                  {tabs.map((t) => (<SelectItem key={t.title} value={t.title}>{t.title}</SelectItem>))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={syncMaster} disabled={busyMaster || !masterUrl.trim()} className="bg-slate-900 hover:bg-slate-800">
              {busyMaster ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              {busyMaster && masterProgress && masterProgress.total > 0
                ? `Sync... ${masterProgress.done}/${masterProgress.total}`
                : "Sync Master"}
            </Button>
            <Button variant="outline" onClick={runDiagnosis} disabled={busyDiag || !masterUrl.trim()}>
              {busyDiag ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Stethoscope className="w-4 h-4 mr-2" />}
              Diagnosa
            </Button>
          </div>
          {masterResult && (
            <div className="text-sm bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-1">
              <p className="font-semibold text-slate-800">{masterResult.total} karyawan tersimpan (tab {masterResult.tab}).</p>
              <p className="text-slate-500">Lini bisnis: {masterResult.distinctLiniBisnis?.join(", ") || "-"}</p>
              {masterResult.failedRanges?.length > 0 && (
                <p className="text-amber-600">Gagal di: {masterResult.failedRanges.join("; ")}. Klik Sync lagi untuk ulangi.</p>
              )}
              {masterResult.duplicates?.length > 0 && (
                <p className="text-amber-600">Nama ganda di Sheet (tersimpan 1x): {masterResult.duplicates.slice(0, 10).join("; ")}{masterResult.duplicates.length > 10 ? ` (+${masterResult.duplicates.length - 10} lagi)` : ""}</p>
              )}
            </div>
          )}
          {diagSteps && (
            <div className="text-xs border border-slate-200 rounded-lg divide-y divide-slate-100">
              {diagSteps.map((s, i) => (
                <div key={i} className="flex items-start gap-2 p-2">
                  {s.ok
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    : <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />}
                  <div className="min-w-0">
                    <p className="font-medium text-slate-700">{i + 1}. {s.name} <span className="text-slate-400 font-normal">({s.ms} ms)</span></p>
                    <p className={`break-words ${s.ok ? "text-slate-500" : "text-red-600"}`}>{s.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50">
          <CardTitle className="text-lg text-slate-800">2. Payroll Bulan Terbaru</CardTitle>
          <CardDescription>Tempel link folder Drive (otomatis pakai file terbaru) atau link satu file. Pastikan dibagikan ke email login Anda.</CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="payroll-folder">Link folder Drive payroll <span className="text-slate-400 font-normal">atau satu file spreadsheet</span></Label>
            <Input
              id="payroll-folder"
              value={payrollFolder}
              onChange={(e) => setPayrollFolder(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/... atau .../spreadsheets/d/..."
              className="font-mono text-xs"
            />
            <p className="text-xs text-slate-400">
              Folder: file terbaru dipilih otomatis (nama YYYY-MM menang). File langsung: tentukan periode di bawah.
            </p>
          </div>
          {payrollIsFile && (
            <div className="space-y-2">
              <Label htmlFor="payroll-periode">Periode bulan file ini (YYYY-MM)</Label>
              <Input id="payroll-periode" value={payrollPeriode} onChange={(e) => setPayrollPeriode(e.target.value)} placeholder="2026-09" className="font-mono" />
            </div>
          )}
          <Button onClick={syncPayroll} disabled={busyPayroll || !payrollFolder.trim()} className="bg-blue-600 hover:bg-blue-700">
            {busyPayroll ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Sync Payroll
          </Button>
          {payrollResult && (
            <div className="text-sm bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-1">
              <p className="font-semibold text-slate-800">
                {payrollResult.matched}/{payrollResult.total} cocok ({payrollResult.periode_bulan}).
              </p>
              {payrollResult.fileUsed && (
                <p className="text-slate-500">File: {payrollResult.fileUsed.name}</p>
              )}
              {payrollResult.unmatched?.length > 0 && (
                <p className="text-amber-600">Tidak cocok: {payrollResult.unmatched.slice(0, 10).join("; ")}{payrollResult.unmatched.length > 10 ? ` (+${payrollResult.unmatched.length - 10} lagi)` : ""}</p>
              )}
              {payrollResult.duplicates?.length > 0 && (
                <p className="text-amber-600">Nama ganda di file payroll (tersimpan 1x): {payrollResult.duplicates.slice(0, 10).join("; ")}{payrollResult.duplicates.length > 10 ? ` (+${payrollResult.duplicates.length - 10} lagi)` : ""}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
