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
    <div className="max-w-4xl">
      {/* headerMode: "shell" — TopBar owns the single <h1>. The form renders
          real h2/h3 section headings under it (one hierarchy, no skips). */}
      <div className="overflow-hidden rounded-lg border border-border bg-surface-1">
        <SettingsForm initialSettings={initialSettings} />
      </div>
    </div>
  );
}
