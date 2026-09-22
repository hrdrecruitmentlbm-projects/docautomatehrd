"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function DataImporter() {
  const [masterFile, setMasterFile] = useState(null);
  const [payrollFile, setPayrollFile] = useState(null);
  const [periode, setPeriode] = useState(currentMonth());
  const [busyMaster, setBusyMaster] = useState(false);
  const [busyPayroll, setBusyPayroll] = useState(false);
  const [masterResult, setMasterResult] = useState(null);
  const [payrollResult, setPayrollResult] = useState(null);

  const uploadMaster = async () => {
    if (!masterFile) return toast.error("Pilih file master dulu");
    setBusyMaster(true);
    setMasterResult(null);
    try {
      const fd = new FormData();
      fd.append("file", masterFile);
      const res = await fetch("/api/import-master", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal impor master");
      setMasterResult(data);
      toast.success(`${data.total} karyawan tersimpan`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusyMaster(false);
    }
  };

  const uploadPayroll = async () => {
    if (!payrollFile) return toast.error("Pilih file payroll dulu");
    if (!/^\d{4}-\d{2}$/.test(periode)) return toast.error("Periode harus YYYY-MM");
    setBusyPayroll(true);
    setPayrollResult(null);
    try {
      const fd = new FormData();
      fd.append("file", payrollFile);
      fd.append("periode_bulan", periode);
      const res = await fetch("/api/import-payroll", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal impor payroll");
      setPayrollResult(data);
      toast.success(`${data.matched}/${data.total} payroll cocok dengan master`);
      if (data.unmatched?.length > 0) toast.warning(`${data.unmatched.length} nama tidak cocok — cek ejaan`);
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
          <CardDescription>Unggah file master (satu spreadsheet). Kolom dikenali dari nama header, urutan bebas.</CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="master-file">File master (.xlsx / .csv)</Label>
            <Input id="master-file" type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setMasterFile(e.target.files?.[0] || null)} />
          </div>
          <Button onClick={uploadMaster} disabled={busyMaster || !masterFile} className="bg-slate-900 hover:bg-slate-800">
            {busyMaster ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            Impor Master
          </Button>
          {masterResult && (
            <div className="text-sm bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-1">
              <p className="font-semibold text-slate-800">{masterResult.total} karyawan tersimpan.</p>
              <p className="text-slate-500">Lini bisnis: {masterResult.distinctLiniBisnis?.join(", ") || "-"}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50">
          <CardTitle className="text-lg text-slate-800">2. Payroll Bulan Terbaru</CardTitle>
          <CardDescription>Unggah file payroll bulan berjalan. Selalu menimpa (yang dipakai PKWT = data terbaru).</CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="periode">Periode bulan (YYYY-MM)</Label>
            <Input id="periode" value={periode} onChange={(e) => setPeriode(e.target.value)} placeholder="2026-09" className="font-mono" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="payroll-file">File payroll (.xlsx / .csv)</Label>
            <Input id="payroll-file" type="file" accept=".xlsx,.xls,.csv" onChange={(e) => setPayrollFile(e.target.files?.[0] || null)} />
          </div>
          <Button onClick={uploadPayroll} disabled={busyPayroll || !payrollFile} className="bg-blue-600 hover:bg-blue-700">
            {busyPayroll ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            Impor Payroll
          </Button>
          {payrollResult && (
            <div className="text-sm bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-1">
              <p className="font-semibold text-slate-800">{payrollResult.matched}/{payrollResult.total} cocok dengan master ({payrollResult.periode_bulan}).</p>
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
