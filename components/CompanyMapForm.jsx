"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Save, MapPinned } from "lucide-react";

// Pemetaan LINI BISNIS -> KOP/template. company_code kosong = tanpa KOP (fallback generik).
export function CompanyMapForm() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/company-map");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal memuat pemetaan");
        setRows(data.mappings || []);
      } catch (e) {
        // error != empty: show it, don't render an empty table that reads
        // as "nothing configured".
        setLoadError(e.message);
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

  return (
    <section aria-labelledby="company-map-heading" className="border-t border-border p-5 sm:p-6">
      <h2 id="company-map-heading" className="text-[15px] font-semibold text-text-1">
        Pemetaan Lini Bisnis ke KOP &amp; Template
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-text-2">
        Satu baris per LINI BISNIS dari master. Kosongkan Kode + Template untuk
        SAHAM/TALOG/TAST (tanpa KOP — dokumen tetap dibuat generik dan KOP
        ditambah manual karena hasilnya bisa diedit). Baris{" "}
        <code className="rounded bg-surface-3 px-1 font-mono text-xs">__FALLBACK__</code>{" "}
        = template generik tanpa KOP.
      </p>

      <div className="mt-4">
        {loading ? (
          /* Skeleton, not "Memuat..." text */
          <div className="space-y-2" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-10 rounded-md motion-reduce:animate-none" />
            ))}
          </div>
        ) : loadError ? (
          /* error != empty, with recovery */
          <div className="rounded-md border border-border bg-surface-2 p-4 text-sm" role="alert">
            <p className="font-semibold text-text-1">Gagal memuat pemetaan</p>
            <p className="mt-1 text-text-2">{loadError} — muat ulang halaman untuk mencoba lagi.</p>
          </div>
        ) : rows.length === 0 ? (
          /* Teaching empty: explains WHY it is empty and the fix */
          <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-border px-6 py-10 text-center">
            <MapPinned className="mb-3 size-6 text-text-2" aria-hidden="true" />
            <p className="mb-1 text-sm font-semibold text-text-1">Belum ada pemetaan</p>
            <p className="max-w-md text-sm text-text-2">
              Sync master dulu — daftar lini bisnis akan muncul di sini untuk
              Anda petakan ke KOP dan template.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
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
                      <TableCell className="whitespace-nowrap font-mono text-sm font-medium text-text-1">
                        {r.lini_bisnis}
                        {!r.company_code && r.lini_bisnis !== "__FALLBACK__" && (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                            TANPA KOP
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input value={r.company_code || ""} onChange={(e) => set(i, "company_code", e.target.value)} placeholder="cth: NUMETA" className="h-10 min-w-[110px] font-mono" />
                      </TableCell>
                      <TableCell>
                        <Input value={r.legal_name || ""} onChange={(e) => set(i, "legal_name", e.target.value)} placeholder="cth: PT ..." className="h-10 min-w-[160px]" />
                      </TableCell>
                      <TableCell>
                        <Input value={r.pkwt_template_id || ""} onChange={(e) => set(i, "pkwt_template_id", e.target.value)} placeholder="ID Google Doc" className="h-10 min-w-[180px] font-mono text-xs" />
                      </TableCell>
                      <TableCell>
                        <Input value={r.pkwt_folder_id || ""} onChange={(e) => set(i, "pkwt_folder_id", e.target.value)} placeholder="ID Folder Drive" className="h-10 min-w-[180px] font-mono text-xs" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {/* Secondary: the page's single primary is Sync Master */}
            <div className="mt-4 flex justify-end">
              <Button variant="outline" onClick={save} disabled={saving} className="h-10 min-w-[160px]">
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Simpan Pemetaan
              </Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
