import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { google } from "googleapis";
import { getGoogleClient } from "@/lib/google";

export const maxDuration = 60;

/**
 * GET /api/documents/[id]/pdf — unduh kontrak sebagai PDF.
 *
 * CATATAN PENTING: drive.files.export MENGEMBALIKAN byte ke pemanggil, tidak
 * pernah membuat file di dalam Drive. Jadi ini selalu "unduh ke perangkat",
 * bukan "simpan ke folder arsip". Menyimpan PDF ke Drive butuh langkah
 * upload terpisah dan tidak dilakukan di sini.
 */
export async function GET(_req, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.email || !session?.accessToken) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const { data: log, error } = await supabaseAdmin
      .from("document_logs")
      .select("id,google_doc_id,document_number,employee_name,document_type")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
    if (!log?.google_doc_id) {
      return Response.json({ error: "Dokumen tidak ditemukan" }, { status: 404 });
    }

    const drive = google.drive({ version: "v3", auth: getGoogleClient(session.accessToken) });
    const res = await drive.files.export({
      fileId: log.google_doc_id,
      mimeType: "application/pdf",
    });

    const bytes = Buffer.from(res.data);
    // Nama file dari nomor dokumen + nama orang, dibersihkan agar aman
    // untuk Content-Disposition.
    const base = `${(log.document_number || "dokumen").replace(/\//g, "-")} - ${
      log.employee_name || log.document_type || "dokumen"
    }`
      .replace(/[^\w\s.-]/g, "")
      .trim();

    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(bytes.length),
        "Content-Disposition": `attachment; filename="${base}.pdf"; filename*=UTF-8''${encodeURIComponent(base)}.pdf`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("PDF export error:", error);
    return Response.json(
      { error: error?.message || "Gagal membuat PDF" },
      { status: 500 }
    );
  }
}
