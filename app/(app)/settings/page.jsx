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
      {/* headerMode: "shell" — TopBar owns the single <h1>. Section headings
          (h2) are added when the form gets its step-7 rework. */}
      <SettingsForm initialSettings={initialSettings} />
    </div>
  );
}
