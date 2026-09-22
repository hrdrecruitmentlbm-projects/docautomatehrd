import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { SheetsSync } from "@/components/SheetsSync";
import { CompanyMapForm } from "@/components/CompanyMapForm";

export default async function DataPage() {
  const session = await auth();

  let saved = {};
  if (session?.user?.email) {
    const { data } = await supabaseAdmin
      .from("settings")
      .select("master_sheet_url, master_tab, payroll_folder_url")
      .eq("user_email", session.user.email)
      .single();
    if (data) saved = data;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="mb-2">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Data Karyawan & Payroll</h1>
        <p className="text-slate-500 mt-1">
          Tempel link Google Sheet + folder Drive, lalu Sync agar PKWT terisi otomatis. Cukup ketik nama saat buat dokumen.
        </p>
      </div>

      <SheetsSync
        initialMasterUrl={saved.master_sheet_url || ""}
        initialMasterTab={saved.master_tab || ""}
        initialPayrollFolder={saved.payroll_folder_url || ""}
      />
      <CompanyMapForm />
    </div>
  );
}
