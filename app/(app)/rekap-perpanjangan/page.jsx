import { auth } from "@/auth";
import { getRenewals, getTodayWib } from "@/lib/jatuh-tempo";
import { RekapPerpanjanganView } from "@/components/RekapPerpanjanganView";

export const dynamic = "force-dynamic";

export default async function RekapPerpanjanganPage({ searchParams }) {
  const session = await auth();
  const sp = (await searchParams) || {};

  const now = new Date();
  const currentMonth = getTodayWib(now).slice(0, 7);
  const selectedBulan = sp.bulan || currentMonth;
  const selectedBasis = sp.basis || "mulai";

  let renewalsData = {
    bulan: selectedBulan,
    basis: selectedBasis,
    total: 0,
    items: [],
    summary: {
      totalPerpanjangan: 0,
      totalBulan: 0,
      rataRataBulan: 0,
      belumDiperpanjangCount: 0,
    },
    trend12Months: [],
    availableMonths: [],
  };

  try {
    renewalsData = await getRenewals({
      bulan: selectedBulan,
      basis: selectedBasis,
      now,
    });
  } catch (err) {
    console.error("Gagal mengambil data rekap perpanjangan:", err);
  }

  return (
    <div className="py-2">
      <RekapPerpanjanganView
        renewalsData={renewalsData}
        currentMonth={currentMonth}
      />
    </div>
  );
}
