import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { verifyDocument } from "@/lib/template-scan";

export const maxDuration = 60;

const CHUNK = 10;
const MAX_ROWS = 5000;

/**
 * POST /api/documents/backfill — pemeriksaan massal dokumen yang sudah ada.
 *
 * Menjalankan verifyDocument() di SELURUH riwayat lalu menyimpan hasilnya.
 * Ini menjawab satu pertanyaan yang selama ini tidak bisa dijawab:
 * "berapa kontrak lama yang keluar dengan {{…}} tercetak di dalamnya?"
 *
 * Dipanggil berurutan dari klien (10 dokumen per permintaan) dengan
 * progress bar, seperti sync-master. Pola yang sama dipakai supaya
 * familiarize — dan supaya tidak kena batas durasi fungsi server.
 *
 * Parameter:
 *   offset  - posisi mulai (default 0)
 *   force   - true = periksa ulang dokumen yang sudah pernah diperiksa
 *
 * POST, bukan GET: proses ini menulis ke database.
 */
export async function POST(req) {
  try {
    const session = await auth();
    if (!session?.user?.email || !session?.accessToken) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const offset = Math.max(parseInt(body?.offset, 10) || 0, 0);
    const force = body?.force === true;

    if (offset >= MAX_ROWS) {
      return Response.json({ done: true, offset, flagged: [], scanned: 0 });
    }

    const { data: rows, error } = await supabaseAdmin
      .from("document_logs")
      .select(
        "id,google_doc_id,document_number,employee_name,document_type,created_at,verified_at,unfilled_marks",
        { count: "exact" }
      )
      .not("google_doc_id", "is", null)
      .order("created_at", { ascending: false })
      .range(offset, Math.min(offset + CHUNK, MAX_ROWS) - 1);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const list = rows || [];
    const flagged = [];
    const failed = [];
    let scanned = 0;

    for (const row of list) {
      // Sudah pernah diperiksa dan tidak ada masalah -> lewati, kecuali dipaksa.
      if (!force && row.verified_at && !(row.unfilled_marks || []).length) continue;

      try {
        const result = await verifyDocument(session.accessToken, row.google_doc_id);
        if (!result.ok) {
          failed.push({ id: row.id, document_number: row.document_number, error: result.error });
          continue;
        }
        scanned += 1;

        const { error: updateError } = await supabaseAdmin
          .from("document_logs")
          .update({
            unfilled_marks: result.unfilled,
            verified_at: new Date().toISOString(),
          })
          .eq("id", row.id);

        // Kolom belum ada = migrasi belum dijalankan. Laporkan sekali saja
        // lewat error supaya pengguna tahu hasilnya tidak tersimpan.
        if (updateError && /column/i.test(updateError.message || "")) {
          return Response.json(
            {
              error:
                "Kolom unfilled_marks belum ada. Jalankan supabase/pkwt-contract.sql di SQL Editor, lalu ulangi.",
              offset,
            },
            { status: 400 }
          );
        }

        if (result.unfilled.length) {
          flagged.push({
            id: row.id,
            document_number: row.document_number,
            employee_name: row.employee_name,
            document_type: row.document_type,
            created_at: row.created_at,
            unfilled: result.unfilled,
          });
        }
      } catch (e) {
        failed.push({ id: row.id, document_number: row.document_number, error: e.message });
      }
    }

    const total = list.length;
    const nextOffset = offset + total;

    return Response.json({
      scanned,
      flagged,
      failed,
      offset,
      nextOffset,
      // Selesai saat baris terakhir kurang dari satu chunk.
      done: total < CHUNK,
      totalCount: nextOffset,
    });
  } catch (error) {
    console.error("Backfill verify error:", error);
    return Response.json(
      { error: error?.message || "Gagal menjalankan pemeriksaan" },
      { status: 500 }
    );
  }
}
