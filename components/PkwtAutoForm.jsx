"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, FileDown, Loader2, Search, TriangleAlert } from "lucide-react";
import { formatRp, formatTanggalId, addMonths } from "@/lib/pkwt";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function PkwtAutoForm() {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedKey, setSelectedKey] = useState("");
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [tanggalMulai, setTanggalMulai] = useState(todayISO());
  const [jangkaBulan, setJangkaBulan] = useState("12");
  const [tanggalTtd, setTanggalTtd] = useState(todayISO());

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/employees?q=${encodeURIComponent(query.trim())}&limit=10`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Gagal mencari karyawan");
        setOptions(data.employees || []);
        if (data.missingTable) toast.error("Tabel employees belum ada. Jalankan supabase/pkwt-v2.sql");
      } catch (e) {
        toast.error(e.message);
        setOptions([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const pickEmployee = async (key, nama) => {
    setSelectedKey(key);
    setQuery(nama);
    setOptions([]);
    setDetail(null);
    setResult(null);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/employee-detail?key=${encodeURIComponent(key)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal memuat data karyawan");
      setDetail(data);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoadingDetail(false);
    }
  };

  const tanggalBerakhirISO = useMemo(() => {
    const n = parseInt(jangkaBulan, 10);
    if (!tanggalMulai || !n) return "";
    return addMonths(new Date(tanggalMulai), n).toISOString().slice(0, 10);
  }, [tanggalMulai, jangkaBulan]);

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!selectedKey) {
      toast.error("Pilih karyawan dulu dari hasil pencarian");
      return;
    }
    if (!tanggalMulai) {
      toast.error("Tanggal mulai wajib diisi");
      return;
    }
    setIsSubmitting(true);
    setResult(null);
    try {
      const response = await fetch("/api/generate-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentType: "pkwt",
          employeeKey: selectedKey,
          manual: {
            tanggal_mulai: tanggalMulai,
            jangka_bulan: jangkaBulan,
            periode_kontrak: jangkaBulan ? `${jangkaBulan} Bulan` : "",
            tanggal_berakhir: tanggalBerakhirISO,
            tanggal_ttd: tanggalTtd,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Terjadi kesalahan");
      setResult(data);
      toast.success(`PKWT ${data.documentNumber} berhasil dibuat!`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const emp = detail?.employee;
  const pay = detail?.payroll;
  const company = detail?.company;

  return (
    <div className="space-y-8">
      {result && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 flex flex-col md:flex-row md:items-center gap-4 justify-between">
          <div>
            <h3 className="text-emerald-800 font-semibold text-lg">Dokumen Berhasil Dibuat!</h3>
            <p className="text-emerald-700 text-sm mt-1 font-mono">{result.documentNumber}</p>
            {result.needsManualKop && (
              <p className="text-amber-700 text-sm mt-2 flex items-start gap-1.5">
                <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />
                Lini bisnis ini belum punya KOP — dokumen memakai template generik. Buka dokumen lalu sisipkan gambar KOP secara manual.
              </p>
            )}
            {!result.needsManualKop && result.kopNote && (
              <p className={`text-sm mt-2 flex items-start gap-1.5 ${result.kopInserted ? "text-emerald-700" : "text-amber-700"}`}>
                {result.kopInserted
                  ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                  : <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0" />}
                {result.kopNote}
              </p>
            )}
          </div>
          <a href={result.docUrl} target="_blank" rel="noreferrer">
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
              <FileDown className="w-4 h-4 mr-2" />
              Buka Dokumen (bisa diedit)
            </Button>
          </a>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-6 bg-white p-8 rounded-xl shadow-sm border border-slate-100">
        {/* Langkah 1: cari karyawan */}
        <div className="space-y-2">
          <Label htmlFor="pkwt-search">Cari Karyawan (ketik nama) <span className="text-red-500">*</span></Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              id="pkwt-search"
              value={query}
              onChange={(e) => {
                const value = e.target.value;
                setQuery(value);
                setSelectedKey("");
                if (value.trim().length < 2) {
                  if (debounceRef.current) clearTimeout(debounceRef.current);
                  setOptions([]);
                  setSearching(false);
                }
              }}
              placeholder="cth: Citra Dewi Yuliani"
              className="pl-9"
              autoComplete="off"
            />
          </div>
          {searching && <p className="text-xs text-slate-400">Mencari...</p>}
          {options.length > 0 && (
            <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100 max-h-64 overflow-y-auto">
              {options.map((o) => (
                <button
                  key={o.nama_key}
                  type="button"
                  onClick={() => pickEmployee(o.nama_key, o.nama_asli)}
                  className="w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors"
                >
                  <p className="text-sm font-semibold text-slate-800">{o.nama_asli}</p>
                  <p className="text-xs text-slate-500">
                    {[o.nik_internal, o.posisi, o.divisi, o.lini_bisnis].filter(Boolean).join(" • ")}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {loadingDetail && <p className="text-sm text-slate-500">Memuat data karyawan + payroll...</p>}

        {/* Langkah 2: preview otomatis */}
        {emp && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/50">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Personal (otomatis)</p>
              <dl className="space-y-1.5 text-sm">
                <div><dt className="text-slate-400 text-xs">Nama</dt><dd className="font-semibold text-slate-800">{emp.nama_asli}</dd></div>
                <div><dt className="text-slate-400 text-xs">TTL</dt><dd className="font-medium text-slate-700">{[emp.tempat_lahir, formatTanggalId(emp.tanggal_lahir)].filter(Boolean).join(", ") || "-"}</dd></div>
                <div><dt className="text-slate-400 text-xs">Alamat</dt><dd className="font-medium text-slate-700">{emp.alamat_tinggal || "-"}</dd></div>
                <div><dt className="text-slate-400 text-xs">No. KTP</dt><dd className="font-medium text-slate-700 font-mono">{emp.no_ktp || "-"}</dd></div>
                <div><dt className="text-slate-400 text-xs">Posisi / Divisi</dt><dd className="font-medium text-slate-700">{[emp.posisi, emp.divisi].filter(Boolean).join(" • ") || "-"}</dd></div>
              </dl>
            </div>
            <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/50">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Payroll (otomatis{pay?.periode_bulan ? ` • ${pay.periode_bulan}` : ""})
              </p>
              {pay ? (
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between"><dt className="text-slate-500">Gapok</dt><dd className="font-semibold text-slate-800">{formatRp(pay.gapok)}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">U. Makan</dt><dd className="font-medium text-slate-700">{formatRp(pay.u_makan)}/hari</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">U. Transport</dt><dd className="font-medium text-slate-700">{formatRp(pay.u_transport)}/hari</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">T. Jabatan</dt><dd className="font-medium text-slate-700">{formatRp(pay.t_jabatan)}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">T. Fungsional</dt><dd className="font-medium text-slate-700">{formatRp(pay.t_fungsional)}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">T. Kesehatan</dt><dd className="font-medium text-slate-700">{formatRp(pay.t_kesehatan)}</dd></div>
                  <div className="flex justify-between"><dt className="text-slate-500">T. Transport</dt><dd className="font-medium text-slate-700">{formatRp(pay.t_transport)}</dd></div>
                </dl>
              ) : (
                <p className="text-sm text-amber-600">Payroll belum ada — impor payroll dulu. Komponen akan terisi Rp 0,-.</p>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 p-4 bg-slate-50/50">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Perusahaan (otomatis)</p>
              <dl className="space-y-1.5 text-sm">
                <div><dt className="text-slate-400 text-xs">Lini Bisnis</dt><dd className="font-semibold text-slate-800">{emp.lini_bisnis || "-"}</dd></div>
                <div><dt className="text-slate-400 text-xs">Kode KOP</dt><dd className="font-semibold text-slate-800">{company?.code || "-"}</dd></div>
                <div>
                  <dt className="text-slate-400 text-xs">Status KOP</dt>
                  <dd className={`text-xs font-bold px-2 py-0.5 rounded-full inline-block ${company?.hasKop ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                    {company?.hasKop ? "Ada KOP" : "Tanpa KOP (tambah manual)"}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        )}

        {/* Langkah 3: 3 input manual */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2 border-t border-slate-100">
          <div className="space-y-2 pt-4">
            <Label htmlFor="tanggal_mulai">Tanggal Mulai Kontrak <span className="text-red-500">*</span></Label>
            <Input id="tanggal_mulai" type="date" value={tanggalMulai} onChange={(e) => setTanggalMulai(e.target.value)} required />
          </div>
          <div className="space-y-2 pt-4">
            <Label htmlFor="jangka">Jangka Waktu <span className="text-red-500">*</span></Label>
            <Select value={jangkaBulan} onValueChange={setJangkaBulan}>
              <SelectTrigger id="jangka"><SelectValue placeholder="Pilih..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 Bulan</SelectItem>
                <SelectItem value="3">3 Bulan</SelectItem>
                <SelectItem value="6">6 Bulan</SelectItem>
                <SelectItem value="12">12 Bulan</SelectItem>
              </SelectContent>
            </Select>
            {tanggalBerakhirISO && (
              <p className="text-xs text-slate-500">Berakhir: <span className="font-semibold text-slate-700">{formatTanggalId(tanggalBerakhirISO)}</span></p>
            )}
          </div>
          <div className="space-y-2 pt-4">
            <Label htmlFor="tanggal_ttd">Tanggal Penandatanganan</Label>
            <Input id="tanggal_ttd" type="date" value={tanggalTtd} onChange={(e) => setTanggalTtd(e.target.value)} />
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <Button type="submit" disabled={isSubmitting || !selectedKey} className="w-full md:w-auto min-w-[200px] bg-blue-600 hover:bg-blue-700">
            {isSubmitting ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />Membuat PKWT...</>) : "Buat PKWT Sekarang"}
          </Button>
        </div>
      </form>
    </div>
  );
}
