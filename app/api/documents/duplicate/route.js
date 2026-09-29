import { auth } from "@/auth";
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { generatePkwt } from "@/lib/generate-pkwt";
import { addMonthsIso, toIsoDate } from "@/lib/contract-lifecycle";

/**
 * POST /api/documents/duplicate — "Buat Salinan".
 *
 * Membuat kontrak BARU untuk karyawan yang sama dengan nomor BARU, memakai
 * jalur pembuatan yang sama persis dengan form PKWT (lib/generate-pkwt.js).
 * Dokumen lama tidak disentuh — itu justru pemeriksaannya yang penting:
 * kontrak yang salah tetap bisa dibuktikan.
 *
 * Kapan dipakai:
 *   - perpanjangan  : tanggal_berakhir lama sudah lewat
 *   - koreksi       : master payroll diperbaiki, kontrak lama perlu diganti
 *   - cetak ulang   : dokumen hilang atau rusak
 *
 * Tanggal yang tidak dikirim dihitung dari tanggal_mulai + jangka_bulan,
 * jadi "Buat Salinan" tanpa mengubah apa pun tetap menghasilkan kontrak
 * dengan masa berlaku yang benar (bukan menyalin masa lalu).
 */
export async function POST(req) {
  try {
    const session = await auth();
    if (!session?.user?.email || !session?.accessToken) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const sourceId = String(body?.id || "").trim();
    if (!sourceId) {
      return Response.json({ error: "id dokumen sumber wajib diisi" }, { status: 400 });
    }

    const { data: source, error: sourceError } = await supabaseAdmin
      .from("document_logs")
      .select("id,document_type,employee_nama_key,employee_name,tanggal_mulai,tanggal_berakhir,jangka_bulan,form_data")
      .eq("id", sourceId)
      .maybeSingle();

    if (sourceError) {
      return Response.json({ error: sourceError.message }, { status: 500 });
    }
    if (!source) {
      return Response.json({ error: "Dokumen sumber tidak ditemukan" }, { status: 404 });
    }
    if (source.document_type !== "pkwt") {
      return Response.json(
        { error: "Buat Salinan baru tersedia untuk PKWT. Dokumen lain belum didukung." },
        { status: 400 }
      );
    }

    const employeeKey = source.employee_nama_key || source.form_data?.employee_nama_key;
    if (!employeeKey) {
      return Response.json(
        { error: "Dokumen sumber ini tidak punya data karyawan, jadi tidak bisa disalin." },
        { status: 400 }
      );
    }

    // Tanggal: pakai yang dikirim, atau hitung ulang dari tanggal_mulai lama
    // + jangka waktu lama. Menyalin masa kontrak yang sudah lewat tanpa
    // diminta akan membuat dokumen kedaluwarsa seketika.
    const start =
      toIsoDate(body?.tanggal_mulai) || toIsoDate(source.tanggal_mulai) || null;
    if (!start) {
      return Response.json(
        { error: "Tanggal mulai kontrak sumber tidak ditemukan. Isi tanggal mulai secara manual." },
        { status: 400 }
      );
    }

    const months =
      parseInt(body?.jangka_bulan || source.jangka_bulan || 0, 10) || 0;
    const end =
      toIsoDate(body?.tanggal_berakhir) ||
      (months > 0 ? addMonthsIso(start, months) : null);

    const { data: settings } = await supabase
      .from("settings")
      .select("*")
      .eq("user_email", session.user.email)
      .maybeSingle();

    const result = await generatePkwt({
      session,
      settings: settings || {},
      employeeKey,
      manual: {
        tanggal_mulai: start,
        tanggal_berakhir: end || "",
        jangka_bulan: months,
        periode_kontrak: months > 0 ? `${months} Bulan` : "",
        tanggal_ttd: toIsoDate(body?.tanggal_ttd) || new Date().toISOString().slice(0, 10),
      },
    });

    if (!result.ok) {
      return Response.json({ error: result.error }, { status: result.status });
    }

    const { ok, ...payload } = result;
    return Response.json({ ...payload, sourceId });
  } catch (error) {
    console.error("Duplicate document error:", error);
    return Response.json(
      { error: error?.message || "Gagal membuat salinan" },
      { status: 500 }
    );
  }
}
