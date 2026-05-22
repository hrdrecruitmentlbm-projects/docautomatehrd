import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { SettingsForm } from "@/components/SettingsForm";

export default async function SettingsPage() {
  const session = await auth();
  
  let initialSettings = {};
  
  if (session?.user?.email) {
    const { data, error } = await supabaseAdmin
      .from('settings')
      .select('*')
      .eq('user_email', session.user.email)
      .single();
      
    if (data) {
      initialSettings = data;
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Pengaturan</h1>
        <p className="text-slate-500 mt-1">Konfigurasi template dokumen dan preferensi akun Anda.</p>
      </div>

      <SettingsForm initialSettings={initialSettings} />
    </div>
  );
}
