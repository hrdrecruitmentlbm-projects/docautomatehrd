import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req) {
  try {
    const session = await auth();
    if (!session || !session.user || !session.user.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await req.json();
    const userEmail = session.user.email;

    // Check if settings exist
    const { data: existingSettings } = await supabaseAdmin
      .from('settings')
      .select('id')
      .eq('user_email', userEmail)
      .single();

    let result;
    if (existingSettings) {
      // Update
      result = await supabaseAdmin
        .from('settings')
        .update({ ...data })
        .eq('user_email', userEmail);
    } else {
      // Insert
      result = await supabaseAdmin
        .from('settings')
        .insert({ user_email: userEmail, ...data });
    }

    if (result.error) {
      console.error("Supabase Settings Error:", result.error);
      return Response.json({ error: "Gagal menyimpan ke database" }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error("API Settings Error:", error);
    return Response.json({ error: "Terjadi kesalahan server" }, { status: 500 });
  }
}
