"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

// Pemetaan LINI BISNIS -> KOP/template. company_code kosong = tanpa KOP (fallback generik).
export function CompanyMapForm() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/company-map");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal memuat pemetaan");
        setRows(data.mappings || []);
      } catch (e) {
        toast.error(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const set = (i, key, value) => {
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/company-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mappings: rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan");
      toast.success(`${data.total} baris pemetaan tersimpan`);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-slate-500">Memuat pemetaan perusahaan...</p>;

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="border-b border-slate-100 bg-slate-50/50">
        <CardTitle className="text-lg text-slate-800">3. Pemetaan Lini Bisnis ke KOP & Template</CardTitle>
        <CardDescription>
          Satu baris per LINI BISNIS dari master. Kosongkan Kode + Template untuk SAHAM/TALOG/TAST (tanpa KOP — dokumen tetap dibuat generik dan KOP ditambah manual karena hasilnya bisa diedit).
          Baris <code className="font-mono text-xs bg-slate-200 px-1 rounded">__FALLBACK__</code> = template generik tanpa KOP.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead>Lini Bisnis</TableHead>
                <TableHead>Kode KOP</TableHead>
                <TableHead>Nama PT (legal)</TableHead>
                <TableHead>Template ID (PKWT)</TableHead>
                <TableHead>Folder ID (hasil)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={r.lini_bisnis}>
                  <TableCell className="font-mono font-semibold text-slate-700 whitespace-nowrap">
                    {r.lini_bisnis}
                    {!r.company_code && r.lini_bisnis !== "__FALLBACK__" && (
                      <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">TANPA KOP</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Input value={r.company_code || ""} onChange={(e) => set(i, "company_code", e.target.value)} placeholder="cth: NUMETA" className="font-mono min-w-[110px]" />
                  </TableCell>
                  <TableCell>
                    <Input value={r.legal_name || ""} onChange={(e) => set(i, "legal_name", e.target.value)} placeholder="cth: PT ..." className="min-w-[160px]" />
                  </TableCell>
                  <TableCell>
                    <Input value={r.pkwt_template_id || ""} onChange={(e) => set(i, "pkwt_template_id", e.target.value)} placeholder="ID Google Doc" className="font-mono text-xs min-w-[180px]" />
                  </TableCell>
                  <TableCell>
                    <Input value={r.pkwt_folder_id || ""} onChange={(e) => set(i, "pkwt_folder_id", e.target.value)} placeholder="ID Folder Drive" className="font-mono text-xs min-w-[180px]" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <div className="p-6 flex justify-end border-t border-slate-100">
          <Button onClick={save} disabled={saving} className="min-w-[150px] bg-slate-900 hover:bg-slate-800">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Simpan Pemetaan
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
