import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";

// GET /api/search?q=&limit=20 — global search over document_logs.
// Scope decision: returns ALL users' documents (matches the dashboard,
// which already aggregates across users). Auth-gated, bounded, ilike over
// employee_name / document_type / user_email.
export async function GET(req) {
  const session = await auth();
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim().slice(0, 100);
  const limit = Math.min(parseInt(searchParams.get("limit") || "20", 10) || 20, 20);

  if (q.length < 2) return Response.json({ results: [] });

  const escaped = q.replace(/[%_,()]/g, " ");
  const pattern = `%${escaped}%`;

  const { data, error } = await supabaseAdmin
    .from("document_logs")
    .select("id, employee_name, document_type, user_email, created_at, google_doc_url")
    .or(
      `employee_name.ilike.${pattern},document_type.ilike.${pattern},user_email.ilike.${pattern}`
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    const missing = /relation|table|schema/i.test(error.message || "");
    return Response.json(
      { error: error.message, results: [], missingTable: missing },
      { status: missing ? 400 : 500 }
    );
  }

  return Response.json({ results: data || [] });
}
