import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { DashboardRevamp } from "@/components/DashboardRevamp";

/**
 * Dashboard.
 *
 * SEMUA angka berasal dari hitungan server-side yang pasti, bukan dari
 * himpunan baris yang dipangkas. Versi lama menarik 500 log terakhir lalu
 * menghitung "Rata² / Hari" dan "Pengguna Aktif" dari situ — dua kartu
 * yang angkanya jelas tidak lengkap dan tidak prompting keputusan apa pun,
 * even sampai footnote mengakui keterbatasannya sendiri. Sekarang tiap KPI
 * adalah exact head-count dengan filter: benar pada volume berapa pun, dan
 * tidak perlu footnote.
 *
 * Tiap KPI adalah LINK ke tempat kerjanya, bukan hiasan.
 */

const TREND_MONTHS = 6;
const TREND_ROWS = 2000;
const RECENT_ROWS = 10;
const KEY_CAP = 5000;

function monthKeys(now, back) {
  const out = [];
  for (let i = back - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("id-ID", { month: "short" }),
    });
  }
  return out;
}

export default async function NewDashboardPage() {
  const session = await auth();
  const email = session?.user?.email || null;

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const soon = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const months = monthKeys(now, TREND_MONTHS);

  const pkwt = (q) => q.eq("document_type", "pkwt");

  // DUA GELOMBANG, bukan sebelas sekaligus.
  //
  // PostgREST punya pool default 10 koneksi dengan timeout antrean ~1
  // detik. Versi pertama dashboard menembakkan sebelas query paralel, dan
  // bersama dua query dari getSyncStatus di layout menjadi 14 — melewati
  // pool, sehingga lambda yang baru start bisa dapat 503 dan seluruh
  // halaman mati. Gelombang pertama = head-count murah untuk KPI.
  const [expiringQ, expiredQ, monthQ, monthMineQ, totalQ, empCountQ, payCountQ, recentQ] =
    await Promise.all([
      pkwt(
        supabaseAdmin
          .from("document_logs")
          .select("id", { count: "exact", head: true })
          .gte("tanggal_berakhir", today)
          .lte("tanggal_berakhir", soon)
      ),
      pkwt(
        supabaseAdmin
          .from("document_logs")
          .select("id", { count: "exact", head: true })
          .lt("tanggal_berakhir", today)
      ),
      supabaseAdmin
        .from("document_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", monthStart),
      supabaseAdmin
        .from("document_logs")
        .select("id", { count: "exact", head: true })
        .gte("created_at", monthStart)
        .eq("user_email", email || "__none__"),
      supabaseAdmin.from("document_logs").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("employees").select("nama_key", { count: "exact", head: true }),
      supabaseAdmin.from("payroll_latest").select("nama_key", { count: "exact", head: true }),
      supabaseAdmin
        .from("document_logs")
        .select(
          "id,employee_name,document_type,created_at,google_doc_url,document_number,user_email,tanggal_berakhir,unfilled_marks"
        )
        .order("created_at", { ascending: false })
        .limit(RECENT_ROWS),
    ]);

  // Gelombang kedua: yang mengambil banyak baris, dan hanya dibutuhkan
  // untuk "Belum ada kontrak" + grafik. Berjalan setelah gelombang pertama
  // supaya tidak berebut koneksi.
  const [empKeysQ, contractKeysQ, trendQ] = await Promise.all([
    supabaseAdmin.from("employees").select("nama_key").limit(KEY_CAP),
    supabaseAdmin
      .from("document_logs")
      .select("employee_nama_key")
      .not("employee_nama_key", "is", null)
      .limit(KEY_CAP),
    supabaseAdmin
      .from("document_logs")
      .select("id,created_at,lini_bisnis")
      .order("created_at", { ascending: false })
      .limit(TREND_ROWS),
  ]);

  // TIDAK melempar. Versi lama melempar begitu satu query gagal, dan
  // hasilnya halaman mati yang tidak memberi petunjuk apa pun. Sekarang
  // setiap kegagalan dicatat, angkanya jadi 0, dan Dashboard menampilkan
  // pita peringatan yang menyebut query mana yang bermasalah — sehingga
  // "database tidak bisa dijangkau" dan "benar-benar tidak ada data"
  // tidak terlihat sama.
  const failed = [
    ["employees", empCountQ],
    ["payroll_latest", payCountQ],
    ["document_logs (jumlah)", totalQ],
    ["document_logs (segera berakhir)", expiringQ],
    ["document_logs (kedaluwarsa)", expiredQ],
    ["document_logs (bulan ini)", monthQ],
    ["document_logs (karyawan)", empKeysQ],
    ["document_logs (kontrak karyawan)", contractKeysQ],
    ["document_logs (tren)", trendQ],
    ["document_logs (terbaru)", recentQ],
  ]
    .filter(([, q]) => q.error)
    .map(([label, q]) => `${label}: ${q.error.message}`);

  if (failed.length) {
    console.error("Dashboard queries failed:\n" + failed.join("\n"));
  }

  const employees = empCountQ.count || 0;
  const missingPayroll = Math.max(employees - (payCountQ.count || 0), 0);

  // "Belum ada kontrak": karyawan yang tidak muncul sebagai
  // employee_nama_key di satu pun baris log.
  const withContract = new Set((contractKeysQ.data || []).map((r) => r.employee_nama_key));
  const noContract = withContract.size
    ? (empKeysQ.data || []).filter((e) => !withContract.has(e.nama_key)).length
    : employees;

  // Tren bulanan + komposisi lini bisnis, dari data yang sudah ditarik.
  const trend = months.map((m) => ({ ...m, total: 0 }));
  const trendIndex = new Map(trend.map((t) => [t.key, t]));
  const lineTotals = new Map();

  for (const row of trendQ.data || []) {
    const t = new Date(row.created_at);
    const line = (row.lini_bisnis || "").trim() || "Tanpa lini";
    if (!isNaN(t)) {
      const bucket = trendIndex.get(
        `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`
      );
      if (bucket) bucket.total += 1;
    }
    lineTotals.set(line, (lineTotals.get(line) || 0) + 1);
  }

  return (
    <DashboardRevamp
      now={now.getTime()}
      kpis={{
        expiring: expiringQ.count || 0,
        expired: expiredQ.count || 0,
        monthTotal: monthQ.count || 0,
        monthMine: monthMineQ.count || 0,
        total: totalQ.count || 0,
        missingPayroll,
        noContract,
        employees,
      }}
      trend={trend}
      byLine={[...lineTotals.entries()]
        .map(([name, value]) => ({ name, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 10)}
      recent={recentQ.data || []}
      queryErrors={failed}
      truncated={(empKeysQ.data || []).length >= KEY_CAP}
    />
  );
}
