import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { google } from "googleapis";
import { getGoogleClient } from "@/lib/google";

/**
 * GET /api/documents/[id] — Ambil data rincian satu dokumen
 */
export async function GET(_req, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return Response.json({ error: "ID dokumen wajib diisi" }, { status: 400 });
    }

    const { data: log, error } = await supabaseAdmin
      .from("document_logs")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
    if (!log) {
      return Response.json({ error: "Dokumen tidak ditemukan" }, { status: 404 });
    }

    return Response.json({ document: log });
  } catch (error) {
    console.error("GET /api/documents/[id] error:", error);
    return Response.json({ error: error?.message || "Gagal memuat dokumen" }, { status: 500 });
  }
}

/**
 * DELETE /api/documents/[id] — Hapus dokumen dari arsip & database
 *
 * 1. Pindahkan file Google Doc di Google Drive ke tempat sampah (trashed: true)
 *    jika token tersedia (aman & bisa dipulihkan bila tidak sengaja terhapus).
 * 2. Hapus baris dari tabel document_logs (atau pkwt_source) di Supabase.
 */
export async function DELETE(_req, { params }) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return Response.json({ error: "ID dokumen wajib diisi" }, { status: 400 });
    }

    // 1. Cari dokumen di tabel document_logs terlebih dahulu
    const { data: log, error: findError } = await supabaseAdmin
      .from("document_logs")
      .select("id, google_doc_id, document_number, employee_name, document_type")
      .eq("id", id)
      .maybeSingle();

    if (findError) {
      return Response.json({ error: findError.message }, { status: 500 });
    }

    if (log) {
      // Dokumen dari aplikasi (document_logs)
      let driveTrashed = false;
      if (session.accessToken && log.google_doc_id) {
        try {
          const drive = google.drive({ version: "v3", auth: getGoogleClient(session.accessToken) });
          await drive.files.update({
            fileId: log.google_doc_id,
            requestBody: { trashed: true },
          });
          driveTrashed = true;
        } catch (driveErr) {
          console.warn(`[DELETE /api/documents/${id}] File Drive tidak dapat dipindahkan ke sampah:`, driveErr.message);
        }
      }

      const { error: delError } = await supabaseAdmin
        .from("document_logs")
        .delete()
        .eq("id", id);

      if (delError) {
        return Response.json({ error: delError.message }, { status: 500 });
      }

      return Response.json({
        success: true,
        message: `Dokumen ${log.document_number || log.employee_name || ""} berhasil dihapus`,
        driveTrashed,
        id,
        documentNumber: log.document_number,
      });
    }

    // 2. Jika tidak ditemukan di document_logs, periksa tabel pkwt_source (data pindaian folder drive)
    const { data: driveItem, error: driveFindError } = await supabaseAdmin
      .from("pkwt_source")
      .select("id, file_id, nomor_pkwt, nama_karyawan")
      .eq("id", id)
      .maybeSingle();

    if (!driveFindError && driveItem) {
      let driveTrashed = false;
      if (session.accessToken && driveItem.file_id) {
        try {
          const drive = google.drive({ version: "v3", auth: getGoogleClient(session.accessToken) });
          await drive.files.update({
            fileId: driveItem.file_id,
            requestBody: { trashed: true },
          });
          driveTrashed = true;
        } catch (driveErr) {
          console.warn(`[DELETE pkwt_source ${id}] File Drive tidak dapat dipindahkan ke sampah:`, driveErr.message);
        }
      }

      const { error: delSourceErr } = await supabaseAdmin
        .from("pkwt_source")
        .delete()
        .eq("id", id);

      if (delSourceErr) {
        return Response.json({ error: delSourceErr.message }, { status: 500 });
      }

      return Response.json({
        success: true,
        message: `Dokumen ${driveItem.nomor_pkwt || driveItem.nama_karyawan || ""} berhasil dihapus`,
        driveTrashed,
        id,
        documentNumber: driveItem.nomor_pkwt,
      });
    }

    return Response.json({ error: "Dokumen tidak ditemukan atau sudah dihapus" }, { status: 404 });
  } catch (error) {
    console.error("DELETE /api/documents/[id] error:", error);
    return Response.json(
      { error: error?.message || "Gagal menghapus dokumen" },
      { status: 500 }
    );
  }
}
