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
      {/* headerMode: "shell" — TopBar owns the single <h1>.
          The how-to copy lives in the shell subtitle, which hides below sm,
          so it is mirrored here for <sm only (content-priority): mobile
          first-run users must still see the instructions, desktop once. */}
      <p className="text-sm text-text-2 sm:hidden">
        Tempel link Google Sheet + folder Drive, lalu Sync agar PKWT terisi
        otomatis. Cukup ketik nama saat buat dokumen.
      </p>

      <SheetsSync
        initialMasterUrl={saved.master_sheet_url || ""}
        initialMasterTab={saved.master_tab || ""}
        initialPayrollFolder={saved.payroll_folder_url || ""}
      />
      <CompanyMapForm />
    </div>
  );
}
