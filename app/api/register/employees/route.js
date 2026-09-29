import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";

/**
 * GET /api/register/employees?keys=a,b,c — detail karyawan untuk bulk.
 *
 * Berbeda dari /api/employees (yang itu autocomplete dengan ILIKE "%q%"),
 * endpoint ini mengambil berdasarkan daftar key yang sudah dipilih di
 * Register. Dipakai hanya untuk mengisi tabel antrean pembuatan massal.
 *
 * menyertakan has_payroll + periode lewat join FK payroll_latest ->
 * employees (yang benar-benar ada di skema), supaya UI bisa memberi
 * peringatan SEBELUM menekan tombol, bukan setelah 12 dari 15 dokumen
 * gagal.
 */
const MAX_KEYS = 200;

export async function GET(req) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const keys = (searchParams.get("keys") || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, MAX_KEYS);

    if (keys.length === 0) {
      return Response.json({ employees: [] });
    }

    const { data, error } = await supabaseAdmin
      .from("employees")
      .select(
        "nama_key,nama_asli,posisi,divisi,lini_bisnis,unit,no_ktp,tanggal_masuk," +
          "payroll_latest(nama_key,periode_bulan,gapok)"
      )
      .in("nama_key", keys);

    if (error) {
      // Kolom payroll_latest belum ada (pkwt-v2.sql belum dijalankan) —
      // tetap Layani dengan data karyawan saja, tandai has_payroll false
      // supaya UI memberi peringatan alih-alih gagal total.
      if (/column|relation/i.test(error.message || "")) {
        const { data: plain, error: plainError } = await supabaseAdmin
          .from("employees")
          .select("nama_key,nama_asli,posisi,divisi,lini_bisnis,unit,no_ktp,tanggal_masuk")
          .in("nama_key", keys);
        if (plainError) {
          return Response.json({ error: plainError.message }, { status: 500 });
        }
        return Response.json({
          employees: (plain || []).map((e) => ({
            ...e,
            has_payroll: false,
            payroll_periode: null,
            gapok: 0,
          })),
          payrollUnavailable: true,
        });
      }      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({
      employees: (data || []).map((e) => {
        const pay = Array.isArray(e.payroll_latest) ? e.payroll_latest[0] : e.payroll_latest;
        return {
          nama_key: e.nama_key,
          nama_asli: e.nama_asli,
          posisi: e.posisi,
          divisi: e.divisi,
          lini_bisnis: e.lini_bisnis,
          unit: e.unit,
          no_ktp: e.no_ktp,
          tanggal_masuk: e.tanggal_masuk,
          has_payroll: !!pay,
          payroll_periode: pay?.periode_bulan || null,
          gapok: pay?.gapok || 0,
        };
      }),
    });
  } catch (error) {
    console.error("Register employees error:", error);
    return Response.json(
      { error: error?.message || "Gagal memuat data karyawan" },
      { status: 500 }
    );
  }
}
