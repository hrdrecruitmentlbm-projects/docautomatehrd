import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { calculateMonthsDiff } from "@/lib/scan-extractor";

export async function GET(req) {
  try {
    const session = await auth();
    if (session?.error) {
      return Response.json({ error: "Sesi Google berakhir, silakan login ulang" }, { status: 401 });
    }
    if (!session?.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Ambil semua dokumen PKWT yang perlu dicek (perlu_dicek = true)
    const { data, error } = await supabaseAdmin
      .from("pkwt_source")
      .select("id, file_id, nomor_surat, nama_asli, nama_key, kode_perusahaan, bulan_folder, tanggal_mulai, tanggal_berakhir, jangka_bulan, perlu_dicek, alasan_cek, manual_override, url, drive_modified_time, scanned_at")
      .eq("perlu_dicek", true)
      .order("id", { ascending: false });

    if (error) {
      return Response.json({ error: `Gagal memuat dokumen perlu dicek: ${error.message}` }, { status: 500 });
    }

    return Response.json({
      success: true,
      count: data?.length || 0,
      items: data || [],
    });
  } catch (err) {
    console.error("pkwt-corrections GET error:", err);
    return Response.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const session = await auth();
    if (session?.error) {
      return Response.json({ error: "Sesi Google berakhir, silakan login ulang" }, { status: 401 });
    }
    if (!session?.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const id = body?.id;
    const fileId = body?.file_id;

    if (!id && !fileId) {
      return Response.json({ error: "ID atau File ID dokumen wajib disertakan" }, { status: 400 });
    }

    const rawStart = String(body?.tanggal_mulai || "").trim();
    const rawEnd = String(body?.tanggal_berakhir || "").trim();

    if (!rawStart) {
      return Response.json({ error: "Tanggal mulai wajib diisi" }, { status: 400 });
    }
    if (!rawEnd) {
      return Response.json({ error: "Tanggal berakhir wajib diisi" }, { status: 400 });
    }

    const dStart = new Date(rawStart + "T00:00:00Z");
    const dEnd = new Date(rawEnd + "T00:00:00Z");

    if (isNaN(dStart.getTime()) || isNaN(dEnd.getTime())) {
      return Response.json({ error: "Format tanggal tidak valid. Gunakan format YYYY-MM-DD" }, { status: 400 });
    }

    // Validasi: tanggal berakhir harus setelah tanggal mulai
    if (dEnd.getTime() <= dStart.getTime()) {
      return Response.json(
        { error: `Tanggal berakhir (${rawEnd}) harus setelah tanggal mulai (${rawStart})` },
        { status: 400 }
      );
    }

    // Hitung jangka waktu bulan
    const jangkaBulan = calculateMonthsDiff(rawStart, rawEnd);

    const updatePayload = {
      tanggal_mulai: rawStart,
      tanggal_berakhir: rawEnd,
      jangka_bulan: jangkaBulan,
      manual_override: true,
      perlu_dicek: false,
      alasan_cek: null, // Reset alasan cek karena sudah dikoreksi manual
    };

    if (body.nomor_surat && String(body.nomor_surat).trim()) {
      updatePayload.nomor_surat = String(body.nomor_surat).trim();
    }
    if (body.kode_perusahaan && String(body.kode_perusahaan).trim()) {
      updatePayload.kode_perusahaan = String(body.kode_perusahaan).trim();
    }

    let query = supabaseAdmin.from("pkwt_source").update(updatePayload);
    if (id) {
      query = query.eq("id", id);
    } else {
      query = query.eq("file_id", fileId);
    }

    const { data, error } = await query.select().single();

    if (error) {
      return Response.json({ error: `Gagal memperbarui data: ${error.message}` }, { status: 500 });
    }

    return Response.json({
      success: true,
      message: "Koreksi manual berhasil disimpan",
      updated: data,
    });
  } catch (err) {
    console.error("pkwt-corrections POST error:", err);
    return Response.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
