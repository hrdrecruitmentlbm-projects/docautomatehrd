import { supabaseAdmin } from "@/lib/supabase";
import RegisterTable from "@/components/register/RegisterTable";
import { stateKeyKaryawan, latestContractByEmployee } from "@/lib/contract-lifecycle";

/**
 * Register Kontrak — siapa yang sudah punya kontrak, siapa yang belum.
 *
 * Ini kebalikan dari /input-dokumen. Halaman itu mulai dari dokumen yang
 * sudah ada; halaman ini mulai dari master karyawan yang lengkap, lalu
 * menandai siapa yang belum tertangani. Itulah yang berubah ketika ada
 * gelombang karyawan baru masuk.
 *
 * SCOPE GLOBAL: konsisten dengan Documents dan pencarian global. Register
 * sengaja TIDAK mengambil no_ktp / alamat / tempat lahir — cukup nama,
 * posisi, divisi, lini bisnis, dan tanggal masuk. Grid berisi ratusan
 * karyawan lengkap dengan nomor KTP adalah permukaan yang tidak boleh ada.
 *
 * JOIN DI JS, BUKAN POSTGREST: document_logs.employee_nama_key adalah
 * text biasa tanpa foreign key ke employees.nama_key, jadi embedded select
 * tidak bisa dipakai. Pada skala ini (ribuan baris, kolom sempit) tiga
 * query + reduce di memori lebih sederhana dan tidak menuntut migrasi
 * tabel yang sedang dipakai produksi.
 */

const MAX_EMPLOYEES = 2000;
const MAX_LOGS = 2000;

const VALID_STATES = ["semua", "segera", "belum", "kedaluwarsa", "aktif", "terbuka"];

export default async function RegisterPage({ searchParams }) {
  const sp = (await searchParams) || {};
  const initialState = VALID_STATES.includes(sp.state) ? sp.state : "semua";
  const initialLine = typeof sp.lini === "string" ? sp.lini : "";

  const [empRes, logRes, payRes] = await Promise.all([
    supabaseAdmin
      .from("employees")
      .select("nama_key,nama_asli,posisi,divisi,lini_bisnis,unit,status_karyawan,tanggal_masuk")
      .order("nama_asli", { ascending: true })
      .limit(MAX_EMPLOYEES),
    supabaseAdmin
      .from("document_logs")
      .select(
        "id,employee_nama_key,document_number,document_type,created_at,tanggal_mulai,tanggal_berakhir,status_dokumen"
      )
      .not("employee_nama_key", "is", null)
      .order("created_at", { ascending: false })
      .limit(MAX_LOGS),
    supabaseAdmin
      .from("payroll_latest")
      .select("nama_key,periode_bulan")
      .limit(MAX_EMPLOYEES),
  ]);

  // error != kosong: kegagalan query harus sampai ke error.jsx, tidak boleh
  // tampil sebagai register kosong yang menyesatkan.
  if (empRes.error) {
    throw new Error(`Gagal memuat data karyawan: ${empRes.error.message}`);
  }

  const now = new Date();
  const employees = empRes.data || [];
  const latest = latestContractByEmployee(logRes.data || []);
  const payroll = new Map((payRes.data || []).map((p) => [p.nama_key, p.periode_bulan]));

  // Satu baris = satu karyawan + kontrak terakhirnya (bila ada).
  const rows = employees.map((e) => ({
    nama_key: e.nama_key,
    nama_asli: e.nama_asli,
    posisi: e.posisi,
    divisi: e.divisi,
    lini_bisnis: e.lini_bisnis,
    unit: e.unit,
    status_karyawan: e.status_karyawan,
    tanggal_masuk: e.tanggal_masuk,
    hasPayroll: payroll.has(e.nama_key),
    payrollPeriode: payroll.get(e.nama_key) || null,
    contract: latest.get(e.nama_key) || null,
    stateKey: stateKeyKaryawan(latest.get(e.nama_key) || null, now),
  }));

  // Hitungan di SELURUH himpunan, bukan hasil filter — supaya strip
  // attention tidak ikut berubah kalau filter kebetulan diganti.
  const counts = { belum: 0, aktif: 0, segera: 0, kedaluwarsa: 0, terbuka: 0 };
  for (const r of rows) counts[r.stateKey] = (counts[r.stateKey] || 0) + 1;

  const lines = [
    ...new Set(rows.map((r) => (r.lini_bisnis || "").trim()).filter(Boolean)),
  ].sort();

  return (
    <RegisterTable
      rows={rows}
      now={now.getTime()}
      lines={lines}
      counts={counts}
      missingPayroll={rows.filter((r) => !r.hasPayroll).length}
      initialState={initialState}
      initialLine={initialLine}
      truncated={
        employees.length >= MAX_EMPLOYEES || (logRes.data || []).length >= MAX_LOGS
      }
    />
  );
}
