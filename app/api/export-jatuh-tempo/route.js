import { auth } from "@/auth";
import * as XLSX from "xlsx";
import { getDueEmployees } from "@/lib/jatuh-tempo";
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
    const status = searchParams.get("status") || "semua";
    const perusahaan = searchParams.get("perusahaan") || "";
    const search = searchParams.get("search") || "";
    const filter = searchParams.get("filter") || "";
    const onlyUnrenewed =
      searchParams.get("belum") === "1" || searchParams.get("belum") === "true";

    const dueData = await getDueEmployees({
      status: status === "semua" ? null : status,
      perusahaan: perusahaan === "semua" ? null : perusahaan,
      search: search || null,
      includeRenewed: true,
    });

    let items = [];
    let fileLabel = bulan || "Semua-Bulan";

    if (filter === "lewat") {
      items = dueData.lewat;
      fileLabel = "Sudah-Lewat";
    } else if (filter === "hari7") {
      items = dueData.hari7;
      fileLabel = "Masa-7-Hari";
    } else if (filter === "hari30") {
      items = dueData.hari30;
      fileLabel = "Masa-30-Hari";
    } else if (filter === "perluDilengkapi") {
      items = dueData.perluDilengkapi;
      fileLabel = "Perlu-Dilengkapi";
    } else if (bulan && bulan !== "semua") {
      const g = dueData.groups.find((group) => group.bulan === bulan);
      items = g ? g.items : [];
    } else {
      items = dueData.groups.flatMap((g) => g.items);
      fileLabel = "Semua-Bulan";
    }

    if (onlyUnrenewed && filter !== "perluDilengkapi") {
      items = items.filter((item) => !item.sudah_diperpanjang);
    }

    const rows = items.map((item, idx) => {
      let statusPerpanjangan = "Belum diperpanjang";
      let keteranganWaktu = "-";

      if (item.sudah_diperpanjang) {
        statusPerpanjangan = "Sudah diperpanjang";
        if (item.tanggal_berakhir_baru_id) {
          keteranganWaktu = `Perpanjangan s.d. ${item.tanggal_berakhir_baru_id}`;
        } else if (item.tanggal_mulai_baru) {
          keteranganWaktu = `Perpanjangan mulai ${formatIsoId(item.tanggal_mulai_baru)}`;
        } else {
          keteranganWaktu = "Sudah diperpanjang";
        }
      } else if (item.sisa_hari === null || item.sisa_hari === undefined) {
        statusPerpanjangan = "Perlu dilengkapi";
        keteranganWaktu = "Tanggal habis kontrak kosong di sheet";
      } else if (item.sisa_hari < 0) {
        keteranganWaktu = `Sudah lewat (${Math.abs(item.sisa_hari)} hari)`;
      } else if (item.sisa_hari <= 30) {
        keteranganWaktu = `${item.sisa_hari} hari lagi (segera)`;
      } else {
        keteranganWaktu = `${item.sisa_hari} hari lagi`;
      }

      let catatan = "-";
      if (item.selisih_dokumen) {
        catatan = `Selisih tanggal (Sheet: ${formatIsoId(item.selisih_dokumen.sheet)} vs Dokumen: ${formatIsoId(item.selisih_dokumen.dokumen)})`;
      }

      return {
        "No": idx + 1,
        "Nama Karyawan": item.nama_asli,
        "NIK": item.nik_internal || "-",
        "Posisi": item.posisi || "-",
        "Divisi": item.divisi || "-",
        "Lini Bisnis": item.lini_bisnis || "-",
        "Tipe Kontrak": item.status_karyawan || "-",
        "Tanggal Masuk": item.tanggal_masuk ? formatIsoId(item.tanggal_masuk) : "-",
        "Tanggal Habis Kontrak": item.tanggal_habis_kontrak ? formatIsoId(item.tanggal_habis_kontrak) : "-",
        "Status": statusPerpanjangan,
        "Tanggal Berakhir Baru": item.tanggal_berakhir_baru_id || "-",
        "Keterangan": keteranganWaktu,
        "Catatan Dokumen": catatan,
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);

    ws["!cols"] = [
      { wch: 6 },  // No
      { wch: 30 }, // Nama
      { wch: 15 }, // NIK
      { wch: 22 }, // Posisi
      { wch: 16 }, // Divisi
      { wch: 18 }, // Lini Bisnis
      { wch: 14 }, // Tipe Kontrak
      { wch: 18 }, // Tgl Masuk
      { wch: 22 }, // Tgl Habis Kontrak
      { wch: 20 }, // Status
      { wch: 22 }, // Tgl Berakhir Baru
      { wch: 30 }, // Keterangan
      { wch: 45 }, // Catatan Dokumen
    ];

    XLSX.utils.book_append_sheet(wb, ws, "Jatuh Tempo");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    const filename = `Jatuh-Tempo-${fileLabel}-${status || "semua"}.xlsx`;

    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Export Excel jatuh tempo error:", err);
    return new Response("Gagal mengekspor data Excel", { status: 500 });
  }
}
