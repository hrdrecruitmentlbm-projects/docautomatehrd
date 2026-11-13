import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { getDueEmployees, getDueSp } from "@/lib/jatuh-tempo";
import { getTodayWib } from "@/lib/contract-lifecycle";
import { JatuhTempoView } from "@/components/JatuhTempoView";

export const dynamic = "force-dynamic";

export default async function JatuhTempoPage({ searchParams }) {
  await auth();
  const sp = (await searchParams) || {};
  const currentMonth = getTodayWib().slice(0, 7);

  const initialStatus = sp.status || "semua";
  const initialPerusahaan = sp.perusahaan || "";
  const initialSearch = sp.search || "";
  const initialFilter = sp.filter || "";
  const initialBulan = sp.bulan || (initialFilter ? "" : currentMonth);
  const initialOnlyUnrenewed = sp.belum === "1" || sp.belum === "true";

  // Ambil data jatuh tempo PKWT dan SP dari server secara paralel
  let dueData = {
    groups: [],
    ringkasan12Bulan: [],
    lewat: [],
    hari7: [],
    hari30: [],
    bulanIni: [],
    bulanDepan: [],
    perluDilengkapi: [],
  };

  try {
    const [dueRes] = await Promise.all([
      getDueEmployees({
        status: initialStatus === "semua" ? null : initialStatus,
        perusahaan: initialPerusahaan === "semua" ? null : initialPerusahaan,
        search: initialSearch,
        includeRenewed: true,
        now: new Date(),
      }),
      getDueSp({
        perusahaan: initialPerusahaan === "semua" ? null : initialPerusahaan,
        search: initialSearch,
        now: new Date(),
      }),
    ]);
    dueData = dueRes;
  } catch (err) {
    console.error("Gagal mengambil data jatuh tempo:", err);
  }

  // Ambil waktu sinkronisasi terakhir dari settings
  let lastMasterSync = null;
  let companyOptions = [];

  try {
    const [setRes, empRes] = await Promise.all([
      supabaseAdmin.from("settings").select("last_master_sync_at").limit(1).maybeSingle(),
      supabaseAdmin.from("employees").select("lini_bisnis, unit").limit(5000),
    ]);

    lastMasterSync = setRes?.data?.last_master_sync_at || null;

    const companies = new Set();
    for (const r of empRes?.data || []) {
      if (r.lini_bisnis && r.lini_bisnis.trim()) companies.add(r.lini_bisnis.trim());
      if (r.unit && r.unit.trim()) companies.add(r.unit.trim());
    }
    companyOptions = Array.from(companies).sort();
  } catch (err) {
    console.error("Gagal mengambil data settings/perusahaan:", err);
  }

  return (
    <div className="py-2">
      <JatuhTempoView
        dueData={dueData}
        currentMonth={currentMonth}
        initialBulan={initialBulan}
        initialStatus={initialStatus}
        initialPerusahaan={initialPerusahaan}
        initialSearch={initialSearch}
        initialFilter={initialFilter}
        initialOnlyUnrenewed={initialOnlyUnrenewed}
        companyOptions={companyOptions}
        lastMasterSync={lastMasterSync}
      />
    </div>
  );
}
