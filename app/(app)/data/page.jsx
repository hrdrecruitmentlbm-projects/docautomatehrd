import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { SheetsSync } from "@/components/SheetsSync";
import { CompanyMapForm } from "@/components/CompanyMapForm";
import { ClipboardList, ArrowRight } from "lucide-react";

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

  const firstRun = !saved.master_sheet_url;
  const payrollPreset = !!saved.payroll_folder_url;

  return (
    <div className="max-w-5xl space-y-4">
      {/* headerMode: "shell" — TopBar owns the single <h1>.
          The how-to copy lives in the shell subtitle, which hides below sm,
          so it is mirrored here for <sm only (content-priority). */}
      <p className="text-sm text-text-2 sm:hidden">
        Tempel link Google Sheet + folder Drive, lalu Sync agar PKWT terisi
        otomatis. Cukup ketik nama saat buat dokumen.
      </p>

      {/* First-run onboarding: teaches the 3-step dependency chain and jumps
          straight to the first input. Rendered only when no master sheet is
          configured yet. */}
      {firstRun && (
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-brand-wash p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <ClipboardList className="mt-0.5 size-5 shrink-0 text-brand-wash-ink" aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold text-brand-wash-ink">
                Sinkronisasi belum diatur
              </p>
              <ol className="mt-1 list-inside list-decimal text-sm text-brand-wash-ink/90">
                <li>Tempel link Sheet master</li>
                <li>Sync master</li>
                <li>Buat PKWT pertama — data terisi otomatis</li>
              </ol>
            </div>
          </div>
          <a
            href="#master-url"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 sm:self-center"
          >
            Mulai
            <ArrowRight className="size-4" aria-hidden="true" />
          </a>
        </div>
      )}

      {/* ONE bordered panel, three hairline-divided sections */}
      <div className="overflow-hidden rounded-lg border border-border bg-surface-1">
        <SheetsSync
          initialMasterUrl={saved.master_sheet_url || ""}
          initialMasterTab={saved.master_tab || ""}
          initialPayrollFolder={saved.payroll_folder_url || ""}
          payrollLocked={firstRun && !payrollPreset}
        />
        <CompanyMapForm />
      </div>
    </div>
  );
}
