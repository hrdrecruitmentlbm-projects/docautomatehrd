import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { SettingsForm } from "@/components/SettingsForm";
import { MigrateArchive } from "@/components/MigrateArchive";
import { DocumentHealth } from "@/components/settings/DocumentHealth";

export default async function SettingsPage() {
  const session = await auth();

  let initialSettings = {};

  if (session?.user?.email) {
    const { data } = await supabaseAdmin
      .from('settings')
      .select('*')
      .eq('user_email', session.user.email)
      .single();

    if (data) {
      initialSettings = data;
    }
  }

  return (
    <div className="max-w-4xl space-y-4">
      {/* headerMode: "shell" — TopBar owns the single <h1>. The form renders
          real h2/h3 section headings under it (one hierarchy, no skips). */}
      <div className="overflow-hidden rounded-lg border border-border bg-surface-1">
        <SettingsForm initialSettings={initialSettings} />
      </div>

      {/* Pemeriksaan template & arsip. Dipisah dari form Settings karena
          keduanya menjalankan operasi, bukan menyimpan preferensi. */}
      <div className="overflow-hidden rounded-lg border border-border bg-surface-1 p-5 sm:p-6">
        <DocumentHealth />
      </div>

      {/* Alat sekali pakai: pindahkan PKWT lama ke struktur arsip bulan/divisi.
          Dipisah kartu sendiri agar bukan bagian dari form Settings (dirty-gate). */}
      <div className="overflow-hidden rounded-lg border border-border bg-surface-1">
        <MigrateArchive />
      </div>
    </div>
  );
}
