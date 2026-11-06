import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { getUnifiedContracts } from "@/lib/pkwt-unified";
import { DashboardRevamp } from "@/components/DashboardRevamp";

export const dynamic = "force-dynamic";

const TREND_MONTHS = 6;
const RECENT_ROWS = 10;

function monthKeys(now, back) {
  const out = [];
  for (let i = back - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      label: d.toLocaleDateString("id-ID", { month: "short", year: "2-digit" }),
    });
  }
  return out;
}

export default async function DashboardPage({ searchParams }) {
  const session = await auth();
  const email = session?.user?.email || null;
  const now = new Date();
  const sp = (await searchParams) || {};

  const filterPeriode = sp.periode || undefined;
  const filterPerusahaan = sp.perusahaan || undefined;
  const filterStatus = sp.status || undefined;
  const filterSumber = sp.sumber || undefined;
  const filterSearch = sp.q || sp.search || undefined;
  const filterPerluCek =
    sp.perlu_dicek !== undefined ? sp.perlu_dicek === "1" || sp.perlu_dicek === "true" : undefined;

  // 1. Ambil seluruh data kontrak terpadu dari getUnifiedContracts (deduplicated & unified)
  const unifiedResult = await getUnifiedContracts({
    periode: filterPeriode,
    perusahaan: filterPerusahaan,
    status: filterStatus,
    sumber: filterSumber,
    search: filterSearch,
    perlu_dicek: filterPerluCek,
    limit: 0, // Ambil semua untuk agregasi dashboard server-side
    now,
  });

  const contracts = unifiedResult.data || [];
  const counts = unifiedResult.counts || {};

  // 2. Ambil data pendukung master karyawan & payroll (gelombang paralel)
  const [empCountQ, payCountQ, recentQ] = await Promise.all([
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

  const employeesTotal = empCountQ.count || 0;
  const missingPayroll = Math.max(employeesTotal - (payCountQ.count || 0), 0);

  // 3. Agregasi Grafik

  // a. Kontrak per Perusahaan (kode_perusahaan)
  const companyCounts = new Map();
  for (const c of contracts) {
    const comp = (c.kode_perusahaan || "Tanpa Perusahaan").trim();
    companyCounts.set(comp, (companyCounts.get(comp) || 0) + 1);
  }
  const byCompany = [...companyCounts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // b. Tren Pembuatan per Bulan
  const months = monthKeys(now, TREND_MONTHS);
  const trendIndex = new Map(months.map((m) => [m.key, { ...m, total: 0 }]));
  for (const c of contracts) {
    if (c.created_at) {
      const t = new Date(c.created_at);
      if (!isNaN(t)) {
        const k = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}`;
        const b = trendIndex.get(k);
        if (b) b.total += 1;
      }
    }
  }
  const trend = Array.from(trendIndex.values());

  // c. Distribusi Status Dokumen
  const statusCounts = {
    draft: 0,
    dikirim: 0,
    ditandatangani: 0,
    arsip: 0,
  };
  for (const c of contracts) {
    const st = c.status_dokumen || "draft";
    if (statusCounts[st] !== undefined) {
      statusCounts[st] += 1;
    } else {
      statusCounts.arsip += 1;
    }
  }
  const byStatus = [
    { key: "ditandatangani", name: "Ditandatangani", value: statusCounts.ditandatangani },
    { key: "dikirim", name: "Dikirim", value: statusCounts.dikirim },
    { key: "draft", name: "Draf", value: statusCounts.draft },
    { key: "arsip", name: "Arsip Drive", value: statusCounts.arsip },
  ];

  // d. Distribusi Durasi Kontrak
  const durationBuckets = {
    short: { key: "short", label: "< 6 Bulan", value: 0 },
    six: { key: "six", label: "6 Bulan", value: 0 },
    twelve: { key: "twelve", label: "12 Bulan", value: 0 },
    long: { key: "long", label: "> 12 Bulan", value: 0 },
    open: { key: "open", label: "Tanpa Durasi", value: 0 },
  };
  for (const c of contracts) {
    const d = c.jangka_bulan;
    if (!d || d <= 0) {
      durationBuckets.open.value += 1;
    } else if (d < 6) {
      durationBuckets.short.value += 1;
    } else if (d === 6) {
      durationBuckets.six.value += 1;
    } else if (d === 12) {
      durationBuckets.twelve.value += 1;
    } else {
      durationBuckets.long.value += 1;
    }
  }
  const byDuration = Object.values(durationBuckets);

  // 4. Daftar Kontrak Segera Berakhir (sisa_hari >= 0 dan <= 90)
  const expiringContracts = contracts
    .filter((c) => c.sisa_hari !== null && c.sisa_hari >= 0 && c.sisa_hari <= 90)
    .sort((a, b) => (a.sisa_hari || 0) - (b.sisa_hari || 0));

  // Hitung jumlah dokumen saya bulan ini
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  let monthMine = 0;
  for (const c of contracts) {
    if (c.user_email === email && c.created_at && c.created_at >= monthStart) {
      monthMine += 1;
    }
  }

  // Daftar perusahaan unik untuk opsi filter
  const companyOptions = [
    ...new Set(
      contracts
        .map((c) => (c.kode_perusahaan || "").trim())
        .filter(Boolean)
    ),
  ].sort();

  return (
    <DashboardRevamp
      now={now.getTime()}
      kpis={{
        aktif: counts.aktif || 0,
        expiring30: counts.expiring30 || 0,
        expiring60: counts.expiring60 || 0,
        expiring90: counts.expiring90 || 0,
        expired: counts.kedaluwarsa || 0,
        monthTotal: counts.createdThisMonth || 0,
        monthMine,
        perluDicek: counts.perluDicek || 0,
        total: counts.total || 0,
        aplikasi: counts.aplikasi || 0,
        drive: counts.drive || 0,
        missingPayroll,
        employees: employeesTotal,
      }}
      byCompany={byCompany}
      trend={trend}
      byStatus={byStatus}
      byDuration={byDuration}
      expiringContracts={expiringContracts}
      recent={recentQ.data || []}
      companyOptions={companyOptions}
      activeFilters={{
        periode: filterPeriode || "",
        perusahaan: filterPerusahaan || "",
        status: filterStatus || "",
        sumber: filterSumber || "",
        search: filterSearch || "",
        perlu_dicek: filterPerluCek,
      }}
    />
  );
}
