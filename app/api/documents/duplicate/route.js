import { auth } from "@/auth";
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { generatePkwt } from "@/lib/generate-pkwt";
import { addMonthsIso, addDaysIso, toIsoDate, getTodayWib } from "@/lib/contract-lifecycle";

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
    let sourceId = String(body?.id || "").trim();
    if (sourceId.startsWith("app_")) sourceId = sourceId.replace(/^app_/, "");
    if (sourceId.startsWith("drive_")) sourceId = sourceId.replace(/^drive_/, "");

    let source = null;
    if (sourceId) {
      const { data: foundSource } = await supabaseAdmin
        .from("document_logs")
        .select("id,document_type,employee_nama_key,employee_name,tanggal_mulai,tanggal_berakhir,jangka_bulan,form_data")
        .eq("id", sourceId)
        .maybeSingle();
      source = foundSource;
    }

    const employeeKey =
      String(body?.employee_nama_key || body?.employeeKey || "").trim() ||
      source?.employee_nama_key ||
      source?.form_data?.employee_nama_key;

    if (!employeeKey) {
      return Response.json(
        { error: "Data karyawan tidak ditemukan untuk membuat perpanjangan dokumen." },
        { status: 400 }
      );
    }

    if (!source && employeeKey) {
      const { data: latestLog } = await supabaseAdmin
        .from("document_logs")
        .select("id,document_type,employee_nama_key,employee_name,tanggal_mulai,tanggal_berakhir,jangka_bulan,form_data")
        .eq("document_type", "pkwt")
        .eq("employee_nama_key", employeeKey)
        .order("tanggal_berakhir", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      if (latestLog) source = latestLog;
    }

    if (source && source.document_type !== "pkwt") {
      return Response.json(
        { error: "Buat Salinan baru tersedia untuk PKWT. Dokumen lain belum didukung." },
        { status: 400 }
      );
    }

    // Tanggal mulai: pakai yang dikirim, atau H+1 tanggal berakhir lama, atau tanggal mulai lama
    const calculatedStart = source?.tanggal_berakhir
      ? addDaysIso(source.tanggal_berakhir, 1)
      : null;

    const start =
      toIsoDate(body?.tanggal_mulai) ||
      calculatedStart ||
      toIsoDate(source?.tanggal_mulai) ||
      getTodayWib();

    const months =
      parseInt(body?.jangka_bulan || source?.jangka_bulan || 12, 10) || 12;
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
        tanggal_ttd: toIsoDate(body?.tanggal_ttd) || getTodayWib(),
        perpanjangan_dari: source?.id || null,
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
