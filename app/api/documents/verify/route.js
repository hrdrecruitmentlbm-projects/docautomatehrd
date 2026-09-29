import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyDocument } from "@/lib/template-scan";

export const maxDuration = 60;

/**
 * POST /api/documents/verify — periksa satu dokumen hasil.
 *
 * Menacey penanda {{…}} yang masih tertinggal dan menyimpannya ke
 * document_logs.unfilled_marks + verified_at supaya bisa dilihat lagi
 * berbulan-bulan kemudian dari halaman Rincian.
 */
export async function POST(req) {
  try {
    const session = await auth();
    if (!session?.user?.email || !session?.accessToken) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const id = String(body?.id || "").trim();
    if (!id) {
      return Response.json({ error: "id wajib diisi" }, { status: 400 });
    }

    const { data: log } = await supabaseAdmin
      .from("document_logs")
      .select("id,google_doc_id")
      .eq("id", id)
      .maybeSingle();

    if (!log?.google_doc_id) {
      return Response.json({ error: "Dokumen tidak ditemukan" }, { status: 404 });
    }

    const result = await verifyDocument(session.accessToken, log.google_doc_id);

    if (result.ok) {
      const patch = {
        unfilled_marks: result.unfilled,
        verified_at: new Date().toISOString(),
      };
      const { error } = await supabaseAdmin
        .from("document_logs")
        .update(patch)
        .eq("id", id);
      if (error) {
        // Kolom belum ada -> supabase/pkwt-contract.sql belum dijalankan.
        // Hasil pemeriksaan tetap dikembalikan ke pengguna.
        return Response.json(
          { ...result, persisted: false, persistError: error.message },
          { status: 200 }
        );
      }
    }

    return Response.json({ ...result, persisted: result.ok });
  } catch (error) {
    console.error("Verify document error:", error);
    return Response.json(
      { error: error?.message || "Gagal memeriksa dokumen" },
      { status: 500 }
    );
  }
}
