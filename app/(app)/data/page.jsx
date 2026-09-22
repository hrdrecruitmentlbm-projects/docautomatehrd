import { DataImporter } from "@/components/DataImporter";
import { CompanyMapForm } from "@/components/CompanyMapForm";

export default function DataPage() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="mb-2">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Data Karyawan & Payroll</h1>
        <p className="text-slate-500 mt-1">
          Impor database master + payroll bulanan agar PKWT terisi otomatis. Cukup ketik nama saat buat dokumen.
        </p>
      </div>

      <DataImporter />
      <CompanyMapForm />
    </div>
  );
}
