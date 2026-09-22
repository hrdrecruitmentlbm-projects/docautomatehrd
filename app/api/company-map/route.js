import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { LINI_BISNIS_MAP, normalizeLiniBisnis } from "@/lib/pkwt";

// GET /api/company-map — gabungan company_map DB + default kode.
// POST /api/company-map — body { mappings: [{ lini_bisnis, company_code, legal_name, pkwt_template_id, pkwt_folder_id }] }
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data, error } = await supabaseAdmin.from("company_map").select("*").order("lini_bisnis");
  if (error) {
    // Tabel belum ada -> kembalikan default agar UI tetap bisa jalan.
    const fallback = Object.entries(LINI_BISNIS_MAP).map(([lini_bisnis, company_code]) => ({
      lini_bisnis,
      company_code,
      legal_name: "",
      pkwt_template_id: "",
      pkwt_folder_id: "",
    }));
    return Response.json({ mappings: fallback, missingTable: true });
  }

  const known = new Set((data || []).map((r) => r.lini_bisnis));
  const merged = [...(data || [])];
  for (const [lini_bisnis, company_code] of Object.entries(LINI_BISNIS_MAP)) {
    if (!known.has(lini_bisnis)) {
      merged.push({ lini_bisnis, company_code, legal_name: "", pkwt_template_id: "", pkwt_folder_id: "" });
    }
  }
  merged.sort((a, b) => String(a.lini_bisnis).localeCompare(String(b.lini_bisnis)));
  return Response.json({ mappings: merged });
}

export async function POST(req) {
  const session = await auth();
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const mappings = body?.mappings;
  if (!Array.isArray(mappings) || mappings.length === 0) {
    return Response.json({ error: "mappings wajib array tidak kosong" }, { status: 400 });
  }
  const payload = mappings.map((m) => ({
    lini_bisnis: normalizeLiniBisnis(m.lini_bisnis),
    company_code: m.company_code ? String(m.company_code).trim().toUpperCase() || null : null,
    legal_name: m.legal_name ? String(m.legal_name).trim() : null,
    pkwt_template_id: m.pkwt_template_id ? String(m.pkwt_template_id).trim() : null,
    pkwt_folder_id: m.pkwt_folder_id ? String(m.pkwt_folder_id).trim() : null,
    updated_at: new Date().toISOString(),
  })).filter((m) => m.lini_bisnis);

  const { error } = await supabaseAdmin.from("company_map").upsert(payload, { onConflict: "lini_bisnis" });
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ success: true, total: payload.length });
}
