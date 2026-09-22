import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";

// GET /api/employees?q=nama&limit=10 — autocomplete cari karyawan.
export async function GET(req) {
  const session = await auth();
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const limit = Math.min(parseInt(searchParams.get("limit") || "10", 10) || 10, 25);
  if (!q) return Response.json({ employees: [] });

  const { data, error } = await supabaseAdmin
    .from("employees")
    .select("nama_key,nama_asli,nik_internal,posisi,divisi,lini_bisnis,unit,no_ktp")
    .ilike("nama_asli", `%${q}%`)
    .limit(limit);

  if (error) {
    const missing = /relation|table|schema/i.test(error.message || "");
    return Response.json(
      { error: error.message, employees: [], missingTable: missing },
      { status: missing ? 400 : 500 }
    );
  }
  return Response.json({ employees: data || [] });
}
