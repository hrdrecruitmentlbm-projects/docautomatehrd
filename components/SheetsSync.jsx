"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, RefreshCw, TableProperties } from "lucide-react";

export function SheetsSync({ initialMasterUrl = "", initialMasterTab = "", initialPayrollFolder = "" }) {
  const [masterUrl, setMasterUrl] = useState(initialMasterUrl);
  const [tabs, setTabs] = useState(initialMasterTab ? [initialMasterTab] : []);
  const [tab, setTab] = useState(initialMasterTab);
  const [loadingTabs, setLoadingTabs] = useState(false);
  const [busyMaster, setBusyMaster] = useState(false);
  const [masterResult, setMasterResult] = useState(null);

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
      if (data.tabs?.length > 0 && !data.tabs.includes(tab)) setTab(data.tabs[0]);
      if ((data.tabs || []).length === 0) toast.warning("Spreadsheet tidak punya tab");
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoadingTabs(false);
    }
  };

  const syncMaster = async () => {
    if (!masterUrl.trim()) return toast.error("Tempel link spreadsheet master dulu");
    setBusyMaster(true);
    setMasterResult(null);
    try {
      const res = await fetch("/api/sync-master", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetUrl: masterUrl.trim(), tab: tab || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal sinkron master");
      setMasterResult(data);
      if (data.tabs) setTabs(data.tabs);
      if (data.tab) setTab(data.tab);
      toast.success(`${data.total} karyawan tersimpan`);
      if (data.persistHint) toast.warning(data.persistHint);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusyMaster(false);
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
                  {tabs.map((t) => (<SelectItem key={t} value={t}>{t}</SelectItem>))}
                </SelectContent>
              </Select>
            )}
          </div>
          <Button onClick={syncMaster} disabled={busyMaster || !masterUrl.trim()} className="bg-slate-900 hover:bg-slate-800">
            {busyMaster ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            Sync Master
          </Button>
          {masterResult && (
            <div className="text-sm bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-1">
              <p className="font-semibold text-slate-800">{masterResult.total} karyawan tersimpan (tab {masterResult.tab}).</p>
              <p className="text-slate-500">Lini bisnis: {masterResult.distinctLiniBisnis?.join(", ") || "-"}</p>
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
