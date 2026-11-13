import { auth } from "@/auth";
import * as XLSX from "xlsx";
import { getRenewals } from "@/lib/jatuh-tempo";
import { formatIsoId } from "@/lib/contract-lifecycle";

export const dynamic = "force-dynamic";

export async function GET(req) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return new Response("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const bulan = searchParams.get("bulan") || "";
    const basis = searchParams.get("basis") || "mulai";

    const renewalsData = await getRenewals({
      bulan: bulan === "semua" ? null : bulan,
      basis,
      now: new Date(),
    });

    const items = renewalsData.items || [];
    const fileLabel = bulan && bulan !== "semua" ? bulan : "Semua-Bulan";

    const rows = items.map((item, idx) => ({
      "No": idx + 1,
      "Nama Karyawan": item.nama_asli,
      "Lini Bisnis / Perusahaan": item.lini_bisnis || item.perusahaan || "-",
      "Perpanjangan Ke": item.perpanjangan_label || `Perpanjangan ke-${item.perpanjangan_ke}`,
      "Urutan Kontrak": item.urutan_kontrak ? `Kontrak ke-${item.urutan_kontrak}` : "-",
      "Tanggal Akhir Lama": item.tanggal_akhir_lama ? formatIsoId(item.tanggal_akhir_lama) : "-",
      "Tanggal Mulai Baru": item.tanggal_mulai_baru ? formatIsoId(item.tanggal_mulai_baru) : "-",
      "Durasi (Bulan)": item.durasi_bulan ? `${item.durasi_bulan} Bulan` : "-",
      "Tanggal Berakhir Baru": item.tanggal_berakhir_baru ? formatIsoId(item.tanggal_berakhir_baru) : "-",
      "Nomor Surat": item.nomor_surat || "-",
      "Status Dokumen": item.status_dokumen || "-",
      "Sumber Data": item.sumber === "drive" ? "Arsip Drive" : "Aplikasi",
      "Tautan Dokumen": item.url || "-",
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    ws["!cols"] = [
      { wch: 6 },
      { wch: 28 },
      { wch: 20 },
      { wch: 18 },
      { wch: 16 },
      { wch: 20 },
      { wch: 20 },
      { wch: 15 },
      { wch: 22 },
      { wch: 25 },
      { wch: 16 },
      { wch: 15 },
      { wch: 40 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Rekap Perpanjangan");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const filename = `Rekap-Perpanjangan-${fileLabel}-${basis}.xlsx`;

    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Export Excel rekap perpanjangan error:", err);
    return new Response("Gagal mengekspor data Excel", { status: 500 });
  }
}
