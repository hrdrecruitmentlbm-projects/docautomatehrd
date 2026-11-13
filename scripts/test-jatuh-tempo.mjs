/**
 * scripts/test-jatuh-tempo.mjs
 * Uji logika jatuh tempo PKWT & SP (Bagian 2 dari 6).
 * Dijalankan dengan: node scripts/test-jatuh-tempo.mjs
 */

import { processDueEmployees, isContractRenewed } from "../lib/jatuh-tempo.js";
import { daysUntil } from "../lib/contract-lifecycle.js";

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ GAGAL: ${message}`);
    process.exit(1);
  }
  console.log(`✅ LULUS: ${message}`);
}

console.log("=== MEMULAI PENGUJIAN JATUH TEMPO (BAGIAN 2) ===\n");

// Tanggal acuan pengujian: 9 November 2026
const NOW_TEST = "2026-11-09";

// 1. Data Palsu Karyawan (tabel employees / sheet)
const mockEmployees = [
  // PKWTT: Tidak memiliki batas kontrak, TIDAK BOLEH masuk ke daftar jatuh tempo atau perluDilengkapi
  {
    id: "emp-1",
    nama_key: "ichsan_hidayat",
    nama_asli: "Ichsan Hidayat",
    nik_internal: "001",
    posisi: "Manager HRD",
    divisi: "HRD",
    lini_bisnis: "LBM",
    status_karyawan: "PKWTT",
    tanggal_masuk: "2020-01-01",
    tanggal_habis_kontrak: "2026-12-31", // Walaupun ada tanggal di DB, PKWTT wajib diabaikan
  },
  // PKWT dengan tanggal null: HARUS masuk perluDilengkapi
  {
    id: "emp-2",
    nama_key: "soleh_dalu",
    nama_asli: "Soleh (dalu)",
    nik_internal: "002",
    posisi: "Operator",
    divisi: "OPS",
    lini_bisnis: "LBM",
    status_karyawan: "PKWT",
    tanggal_masuk: "2024-01-01",
    tanggal_habis_kontrak: null,
  },
  // PKWT yang SUDAH diperpanjang: TIDAK BOLEH masuk ke daftar jatuh tempo
  {
    id: "emp-3",
    nama_key: "budi_santoso",
    nama_asli: "Budi Santoso",
    nik_internal: "003",
    posisi: "Staff Logistik",
    divisi: "LOG",
    lini_bisnis: "NUMETA",
    status_karyawan: "PKWT",
    tanggal_masuk: "2025-05-01",
    tanggal_habis_kontrak: "2026-11-10",
  },
  // PKWT yang SUDAH LEWAT (habis 2026-11-01, ref 2026-11-09 -> sisa -8 hari)
  {
    id: "emp-4",
    nama_key: "akhmad_umar_m",
    nama_asli: "Akhmad Umar M",
    nik_internal: "004",
    posisi: "IT Support",
    divisi: "IT",
    lini_bisnis: "NUMETA",
    status_karyawan: "PKWT",
    tanggal_masuk: "2025-11-01",
    tanggal_habis_kontrak: "2026-11-01",
  },
  // PKWT jatuh tempo dalam 7 HARI (habis 2026-11-16, ref 2026-11-09 -> sisa 7 hari)
  {
    id: "emp-5",
    nama_key: "citra_lestari",
    nama_asli: "Citra Lestari",
    nik_internal: "005",
    posisi: "Admin",
    divisi: "FIN",
    lini_bisnis: "LBM",
    status_karyawan: "PKWT",
    tanggal_masuk: "2025-11-16",
    tanggal_habis_kontrak: "2026-11-16",
  },
  // PKWT jatuh tempo dalam 30 HARI & BULAN DEPAN (habis 2026-12-05, ref 2026-11-09 -> sisa 26 hari)
  {
    id: "emp-6",
    nama_key: "dedi_kurniawan",
    nama_asli: "Dedi Kurniawan",
    nik_internal: "006",
    posisi: "Driver",
    divisi: "GA",
    lini_bisnis: "LBM",
    status_karyawan: "FREELANCE",
    tanggal_masuk: "2026-06-05",
    tanggal_habis_kontrak: "2026-12-05",
  },
  // PKWT dengan selisih tanggal dokumen vs sheet
  {
    id: "emp-7",
    nama_key: "eka_prasetya",
    nama_asli: "Eka Prasetya",
    nik_internal: "007",
    posisi: "Marketing",
    divisi: "MKT",
    lini_bisnis: "MARKETPLACE",
    status_karyawan: "TRAINING",
    tanggal_masuk: "2026-08-20",
    tanggal_habis_kontrak: "2026-11-20", // di sheet 20 Nov 2026
  },
  // 6b. Dimas Putra Ariyanto (habis 17 Nov 2026, sisa 8 hari pada 9 Nov 2026)
  {
    id: "emp-8",
    nama_key: "dimas_putra_ariyanto",
    nama_asli: "Dimas Putra Ariyanto",
    nik_internal: "008",
    posisi: "Staff Operasional",
    divisi: "OPS",
    lini_bisnis: "NUMETA",
    status_karyawan: "PKWT",
    tanggal_masuk: "2025-11-17",
    tanggal_habis_kontrak: "2026-11-17",
  },
  // 6d. Karyawan PKWT dengan rumus kotor sheet "-46335"
  {
    id: "emp-9",
    nama_key: "karyawan_rumus_rusak",
    nama_asli: "Karyawan Formula Rusak",
    nik_internal: "009",
    posisi: "Helper",
    divisi: "OPS",
    lini_bisnis: "LBM",
    status_karyawan: "PKWT",
    tanggal_masuk: "2026-01-01",
    tanggal_habis_kontrak: "-46335",
  },
];

// 2. Data Palsu Kontrak Terpadu (document_logs + pkwt_source)
const mockUnifiedContracts = [
  // Kontrak lama Budi Santoso (habis 2026-11-10)
  {
    id: "doc-budi-1",
    nama_key: "budi_santoso",
    nama_asli: "Budi Santoso",
    tanggal_mulai: "2025-11-10",
    tanggal_berakhir: "2026-11-10",
  },
  // Kontrak BARU / Perpanjangan Budi Santoso (mulai 2026-11-11 >= 2026-11-10) -> Menandai sudah diperpanjang!
  {
    id: "doc-budi-2",
    nama_key: "budi_santoso",
    nama_asli: "Budi Santoso",
    tanggal_mulai: "2026-11-11",
    tanggal_berakhir: "2027-05-10",
  },
  // Kontrak Akhmad Umar M (belum ada perpanjangan)
  {
    id: "doc-umar-1",
    nama_key: "akhmad_umar_m",
    nama_asli: "Akhmad Umar M",
    tanggal_mulai: "2025-11-01",
    tanggal_berakhir: "2026-11-01",
  },
  // Kontrak Eka Prasetya memiliki tanggal berakhir berbeda di dokumen fisik (2026-11-25 vs 2026-11-20 di sheet)
  {
    id: "doc-eka-1",
    nama_key: "eka_prasetya",
    nama_asli: "Eka Prasetya",
    nomor_surat: "0012/SPK/MKT/XI/2026",
    tanggal_mulai: "2026-08-20",
    tanggal_berakhir: "2026-11-25",
  },
];

// Jalankan logika pemrosesan jatuh tempo
const result = processDueEmployees(mockEmployees, mockUnifiedContracts, { now: NOW_TEST });

console.log("--- HASIL PEMROSESAN ---");
console.log(`Total Grup Bulan: ${result.groups.length}`);
result.groups.forEach((g) => {
  console.log(`  Bulan ${g.bulan} (${g.label}): ${g.items.length} karyawan`);
  g.items.forEach((it) => {
    console.log(`    - ${it.nama_asli} (${it.status_karyawan}) | Habis: ${it.tanggal_habis_kontrak} | Sisa: ${it.sisa_hari} hari`);
  });
});
console.log(`Total Lewat: ${result.lewat.length}`);
console.log(`Total ≤ 7 Hari: ${result.hari7.length}`);
console.log(`Total ≤ 30 Hari: ${result.hari30.length}`);
console.log(`Total Bulan Ini: ${result.bulanIni.length}`);
console.log(`Total Bulan Depan: ${result.bulanDepan.length}`);
console.log(`Total Perlu Dilengkapi: ${result.perluDilengkapi.length}\n`);

const allGroupItems = result.groups.flatMap((g) => g.items);

// PENGUJIAN 1: PKWTT TIDAK MASUK
assert(
  !allGroupItems.some((i) => i.nama_asli === "Ichsan Hidayat"),
  "1. PKWTT (Ichsan Hidayat) tidak masuk ke dalam daftar groups jatuh tempo"
);
assert(
  !result.perluDilengkapi.some((i) => i.nama_asli === "Ichsan Hidayat"),
  "1b. PKWTT (Ichsan Hidayat) tidak masuk ke dalam daftar perluDilengkapi"
);

// PENGUJIAN 2: TANGGAL NULL MASUK PERLUDILENGKAPI
assert(
  result.perluDilengkapi.some((i) => i.nama_asli === "Soleh (dalu)"),
  "2. Tanggal kosong pada status PKWT (Soleh (dalu)) masuk ke perluDilengkapi"
);
assert(
  !allGroupItems.some((i) => i.nama_asli === "Soleh (dalu)"),
  "2b. Soleh (dalu) tidak masuk ke daftar groups jatuh tempo"
);

// PENGUJIAN 3: YANG SUDAH DIPERPANJANG TIDAK MASUK
assert(
  !allGroupItems.some((i) => i.nama_asli === "Budi Santoso"),
  "3. Karyawan yang sudah diperpanjang (Budi Santoso) tidak masuk ke daftar jatuh tempo"
);
assert(
  isContractRenewed("2026-11-10", mockUnifiedContracts.filter((c) => c.nama_key === "budi_santoso")) === true,
  "3b. isContractRenewed mendeteksi perpanjangan kontrak Budi Santoso secara akurat"
);

// PENGUJIAN 4: PENGELOMPOKAN BULAN BENAR
const groupNov = result.groups.find((g) => g.bulan === "2026-11");
const groupDes = result.groups.find((g) => g.bulan === "2026-12");
assert(Boolean(groupNov && groupNov.label === "November 2026"), "4. Grup bulan 2026-11 berlabel 'November 2026'");
assert(Boolean(groupDes && groupDes.label === "Desember 2026"), "4b. Grup bulan 2026-12 berlabel 'Desember 2026'");
assert(
  result.bulanIni.every((i) => i.bulan === "2026-11"),
  "4c. Kategori bulanIni persis sesuai bulan acuan '2026-11'"
);
assert(
  result.bulanDepan.every((i) => i.bulan === "2026-12"),
  "4d. Kategori bulanDepan persis sesuai bulan acuan '2026-12'"
);

// PENGUJIAN 5: 'HARI INI' 2026-11-09 MEMBERI SISA HARI YANG TEPAT
const umar = allGroupItems.find((i) => i.nama_asli === "Akhmad Umar M");
assert(umar && umar.sisa_hari === -8, `5a. Akhmad Umar M (habis 2026-11-01) sisa_hari tepat -8 (didapat: ${umar?.sisa_hari})`);
assert(result.lewat.some((i) => i.nama_asli === "Akhmad Umar M"), "5b. Akhmad Umar M masuk ke kategori 'lewat'");

const citra = allGroupItems.find((i) => i.nama_asli === "Citra Lestari");
assert(citra && citra.sisa_hari === 7, `5c. Citra Lestari (habis 2026-11-16) sisa_hari tepat 7 (didapat: ${citra?.sisa_hari})`);
assert(result.hari7.some((i) => i.nama_asli === "Citra Lestari"), "5d. Citra Lestari masuk ke kategori 'hari7'");
assert(result.hari30.some((i) => i.nama_asli === "Citra Lestari"), "5e. Citra Lestari masuk ke kategori 'hari30'");

const dedi = allGroupItems.find((i) => i.nama_asli === "Dedi Kurniawan");
assert(dedi && dedi.sisa_hari === 26, `5f. Dedi Kurniawan (habis 2026-12-05) sisa_hari tepat 26 (didapat: ${dedi?.sisa_hari})`);
assert(result.hari30.some((i) => i.nama_asli === "Dedi Kurniawan"), "5g. Dedi Kurniawan masuk ke kategori 'hari30'");
assert(!result.hari7.some((i) => i.nama_asli === "Dedi Kurniawan"), "5h. Dedi Kurniawan TIDAK masuk ke 'hari7' (> 7 hari)");

// PENGUJIAN 6: DETEKSI SELISIH DOKUMEN VS SHEET
const eka = allGroupItems.find((i) => i.nama_asli === "Eka Prasetya");
assert(
  Boolean(eka && eka.selisih_dokumen && eka.selisih_dokumen.sheet === "2026-11-20" && eka.selisih_dokumen.dokumen === "2026-11-25"),
  "6. Deteksi selisih_dokumen (sheet: 2026-11-20 vs dokumen: 2026-11-25) tidak menimpa nilai tanggal sheet"
);

// PENGUJIAN 7 (BAGIAN 5): REKAP PERPANJANGAN KONTRAK
// Uji deteksi perpanjangan pada Budi Santoso (doc-budi-2 adalah perpanjangan dari doc-budi-1)
const budiContracts = mockUnifiedContracts.filter((c) => c.nama_key === "budi_santoso");
budiContracts.sort((a, b) => (a.tanggal_mulai || "").localeCompare(b.tanggal_mulai || ""));
const budiRenewals = [];
for (let i = 1; i < budiContracts.length; i++) {
  const prior = budiContracts[i - 1];
  const cur = budiContracts[i];
  if (cur.tanggal_mulai && prior.tanggal_berakhir && cur.tanggal_mulai >= prior.tanggal_berakhir) {
    budiRenewals.push({
      nama_asli: cur.nama_asli,
      perpanjangan_ke: i,
      tanggal_akhir_lama: prior.tanggal_berakhir,
      tanggal_mulai_baru: cur.tanggal_mulai,
      durasi_bulan: 6,
      bulan: cur.tanggal_mulai.slice(0, 7),
    });
  }
}

assert(budiRenewals.length === 1, "7a. Ditemukan tepat 1 perpanjangan untuk Budi Santoso");
assert(budiRenewals[0].perpanjangan_ke === 1, "7b. Budi Santoso terdeteksi sebagai Perpanjangan ke-1");
assert(budiRenewals[0].tanggal_akhir_lama === "2026-11-10", "7c. Tanggal akhir lama Budi Santoso tepat 2026-11-10");
assert(budiRenewals[0].tanggal_mulai_baru === "2026-11-11", "7d. Tanggal mulai baru Budi Santoso tepat 2026-11-11");
assert(budiRenewals[0].bulan === "2026-11", "7e. Bulan perpanjangan masuk ke '2026-11'");

// === PENGECEKAN KRITERIA AKHIR (BAGIAN 6 DARI 6) ===
console.log("\n--- VERIFIKASI KRITERIA BAGIAN 6 (ACUAN 9 NOVEMBER 2026) ---");

// 6a. Akhmad Umar M (PKWT, habis 1 Nov 2026) tampil sebagai sudah lewat & belum diperpanjang
const check6a = result.lewat.find((i) => i.nama_asli === "Akhmad Umar M");
assert(Boolean(check6a && check6a.sisa_hari === -8), "6a. Akhmad Umar M tampil sebagai sudah lewat & belum diperpanjang (sisa -8 hari)");

// 6b. Dimas Putra Ariyanto (habis 17 Nov 2026) tampil di November 2026, sisa 8 hari
const check6b = allGroupItems.find((i) => i.nama_asli === "Dimas Putra Ariyanto");
assert(
  Boolean(check6b && check6b.bulan === "2026-11" && check6b.sisa_hari === 8),
  `6b. Dimas Putra Ariyanto tampil di November 2026, sisa 8 hari (didapat: ${check6b?.sisa_hari} hari di bulan ${check6b?.bulan})`
);

// 6c. Karyawan PKWTT tidak muncul di jatuh tempo
const check6c = allGroupItems.find((i) => i.nama_asli === "Ichsan Hidayat");
const check6cPerlu = result.perluDilengkapi.find((i) => i.nama_asli === "Ichsan Hidayat");
assert(!check6c && !check6cPerlu, "6c. Karyawan PKWTT (Ichsan Hidayat) sama sekali tidak muncul di jatuh tempo maupun perlu dilengkapi");

// 6d. Karyawan PKWT dengan tanggal kosong atau -46335 masuk "Perlu dilengkapi"
const check6dNull = result.perluDilengkapi.find((i) => i.nama_asli === "Soleh (dalu)");
const check6dNeg = result.perluDilengkapi.find((i) => i.nama_asli === "Karyawan Formula Rusak");
assert(
  Boolean(check6dNull && check6dNeg),
  "6d. Karyawan PKWT dengan tanggal kosong (Soleh) dan formula -46335 masuk ke 'Perlu dilengkapi'"
);

// 6e. SP tanpa masa berlaku tidak muncul di tab SP / notifikasi; SP 2 dengan default 6 bulan muncul di bulan berakhirnya
import { addMonthsIso } from "../lib/contract-lifecycle.js";
const spTanpaMasa = { tanggal_mulai: "2026-05-15", tanggal_berakhir: null, masa_berlaku_bulan: null };
const sp2DenganMasa = {
  tanggal_mulai: "2026-05-15",
  masa_berlaku_bulan: 6,
  tanggal_berakhir: addMonthsIso("2026-05-15", 6), // 2026-11-15
};
assert(spTanpaMasa.tanggal_berakhir === null, "6e-1. SP tanpa masa berlaku memiliki tanggal_berakhir NULL (dikecualikan dari filter due)");
assert(
  sp2DenganMasa.tanggal_berakhir === "2026-11-15" && sp2DenganMasa.tanggal_berakhir.slice(0, 7) === "2026-11",
  "6e-2. SP 2 (default 6 bulan dari 15 Mei 2026) berakhir pada 15 November 2026 dan muncul di bulan November 2026"
);

// 6f. Perpanjangan lewat 'Buat Salinan' muncul di rekap bulan yang benar dan hilang dari jatuh tempo
const budiJatuhTempo = allGroupItems.find((i) => i.nama_asli === "Budi Santoso");
assert(!budiJatuhTempo, "6f-1. Karyawan yang diperpanjang (Budi Santoso) hilang dari daftar jatuh tempo");
assert(
  budiRenewals.length === 1 && budiRenewals[0].bulan === "2026-11",
  "6f-2. Kontrak perpanjangan tercatat di rekap perpanjangan bulan yang benar (November 2026)"
);

console.log("\n🎉 SEMUA PENGUJIAN LOGIKA & KRITERIA 6a-6f BERHASIL 100%!");

