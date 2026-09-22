import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveCompany } from "@/lib/pkwt";

// GET /api/employee-detail?key=nama_key — personal + payroll + perusahaan.
export async function GET(req) {
  const session = await auth();
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const key = (searchParams.get("key") || "").trim().toLowerCase();
  if (!key) return Response.json({ error: "key wajib diisi" }, { status: 400 });

  const { data: employee, error: empError } = await supabaseAdmin
    .from("employees")
    .select("*")
    .eq("nama_key", key)
    .single();

  if (empError || !employee) {
    return Response.json({ error: "Karyawan tidak ditemukan" }, { status: 404 });
  }

  const { data: payroll } = await supabaseAdmin
    .from("payroll_latest")
    .select("*")
    .eq("nama_key", key)
    .single();

  // Mapping perusahaan: company_map DB diutamakan, fallback ke default kode.
  let mapping = null;
  const { data: mapRow } = await supabaseAdmin
    .from("company_map")
    .select("*")
    .eq("lini_bisnis", (employee.lini_bisnis || "").toUpperCase().trim())
    .single();
  if (mapRow) mapping = mapRow;

  const resolved = resolveCompany(employee.lini_bisnis);
  const companyCode = mapping?.company_code || resolved.companyCode;
  const hasKop = mapping ? !!mapping.company_code : resolved.hasKop;

  return Response.json({
    employee,
    payroll: payroll || null,
    mapping,
    company: { code: companyCode, hasKop, legalName: mapping?.legal_name || "" },
  });
}
