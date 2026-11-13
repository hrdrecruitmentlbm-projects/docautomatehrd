import { supabaseAdmin, friendlyDbError } from "./supabase.js";
import { getUnifiedContracts } from "./pkwt-unified.js";
import {
  daysUntil,
  toIsoDate,
  formatIsoId,
  getTodayWib,
  getMonthOffsets,
  getMonthLabel,
  addDaysIso,
} from "./contract-lifecycle.js";
import { BULAN_ID, normalizeName, normalizeLiniBisnis } from "./pkwt.js";

export { getTodayWib, getMonthOffsets, getMonthLabel };

/** Status karyawan yang memiliki masa berlaku kontrak / tanggal habis kontrak. */
export const STATUS_DENGAN_KONTRAK = ["PKWT", "FREELANCE", "TRAINING"];

/**
 * Aturan Bersama: Cek apakah sebuah kontrak sudah diperpanjang / ditangani.
 *
 * Dianggap sudah diperpanjang bila ada kontrak PKWT lain untuk karyawan yang sama
 * (dari document_logs atau pkwt_source) dengan tanggal_mulai >= tanggal_berakhir kontrak lama
 * (dan bukan baris kontrak yang persis sama bila excludeContractId diberikan).
 *
 * @param {string} targetEndDateIso - Tanggal berakhir kontrak lama (ISO YYYY-MM-DD)
 * @param {Array} employeeContracts - Daftar kontrak milik karyawan
 * @param {string|null} [excludeContractId=null] - ID kontrak lama (opsional)
 * @returns {boolean}
 */
export function isContractRenewed(targetEndDateIso, employeeContracts = [], excludeContractId = null) {
  const endIso = toIsoDate(targetEndDateIso);
  if (!endIso) return false;

  return (employeeContracts || []).some((other) => {
    if (!other?.tanggal_mulai) return false;
    const otherStartIso = toIsoDate(other.tanggal_mulai);
    if (!otherStartIso) return false;

    // Lewati jika ini adalah baris dokumen yang sama
    if (excludeContractId && (other.id === excludeContractId || other.source_id === excludeContractId)) {
      return false;
    }

    // Perpanjangan: tanggal_mulai >= tanggal_berakhir kontrak lama
    return otherStartIso >= endIso;
  });
}

/**
 * Logika murni pemrosesan karyawan jatuh tempo (dapat diuji tanpa database).
 *
 * @param {Array} employees - Daftar karyawan dari database (tabel employees)
 * @param {Array} unifiedContracts - Daftar seluruh kontrak terpadu (dari getUnifiedContracts)
 * @param {Object} [filters]
 * @param {string} [filters.status]
 * @param {string} [filters.perusahaan]
 * @param {string} [filters.search]
 * @param {Date|string|number} [filters.now]
 * @returns {{ groups: Array, lewat: Array, hari7: Array, hari30: Array, bulanIni: Array, bulanDepan: Array, perluDilengkapi: Array }}
 */
export function processDueEmployees(
  employees = [],
  unifiedContracts = [],
  { status = null, perusahaan = null, search = null, now = null } = {}
) {
  const refIso = now ? (toIsoDate(now) || getTodayWib(now)) : getTodayWib();
  const { thisMonth, nextMonth } = getMonthOffsets(refIso);

  const filterStatus = status && status !== "semua" ? String(status).trim().toUpperCase() : null;
  const filterPerusahaan = perusahaan && perusahaan !== "semua" ? normalizeLiniBisnis(perusahaan) : null;
  const filterSearch = search && String(search).trim() ? String(search).trim().toLowerCase() : null;

  // 1. Indeks kontrak terpadu per nama_key
  const contractsByEmployee = new Map();
  for (const c of unifiedContracts || []) {
    const key = c.nama_key || (c.nama_asli ? normalizeName(c.nama_asli) : null);
    if (!key) continue;
    if (!contractsByEmployee.has(key)) {
      contractsByEmployee.set(key, []);
    }
    contractsByEmployee.get(key).push(c);
  }

  // Urutkan tiap riwayat kontrak karyawan dari tanggal_berakhir terbaru ke terlama
  for (const list of contractsByEmployee.values()) {
    list.sort((a, b) => {
      const endA = toIsoDate(a.tanggal_berakhir) || "";
      const endB = toIsoDate(b.tanggal_berakhir) || "";
      return endB.localeCompare(endA);
    });
  }

  const groupsMap = new Map(); // bulan -> items[]
  const lewat = [];
  const hari7 = [];
  const hari30 = [];
  const bulanIni = [];
  const bulanDepan = [];
  const perluDilengkapi = [];

  for (const emp of employees || []) {
    const rawStatus = String(emp.status_karyawan || "").trim().toUpperCase();

    // HANYA karyawan berstatus PKWT/FREELANCE/TRAINING yang memiliki tanggal akhir kontrak.
    // PKWTT TIDAK IKUT sama sekali.
    if (!STATUS_DENGAN_KONTRAK.includes(rawStatus)) {
      continue;
    }

    // Filter status jika diminta
    if (filterStatus && rawStatus !== filterStatus) {
      continue;
    }

    // Filter perusahaan jika diminta
    if (filterPerusahaan) {
      const empLine = emp.lini_bisnis ? normalizeLiniBisnis(emp.lini_bisnis) : "";
      const empUnit = emp.unit ? normalizeLiniBisnis(emp.unit) : "";
      if (empLine !== filterPerusahaan && empUnit !== filterPerusahaan) {
        continue;
      }
    }

    // Filter pencarian teks jika diminta
    if (filterSearch) {
      const matchNama = emp.nama_asli ? emp.nama_asli.toLowerCase().includes(filterSearch) : false;
      const matchKey = emp.nama_key ? emp.nama_key.toLowerCase().includes(filterSearch) : false;
      const matchNik = emp.nik_internal ? String(emp.nik_internal).toLowerCase().includes(filterSearch) : false;
      if (!matchNama && !matchKey && !matchNik) {
        continue;
      }
    }

    const sheetEndIso = toIsoDate(emp.tanggal_habis_kontrak);

    // Karyawan PKWT/FREELANCE/TRAINING yang tanggal habis kontraknya NULL / tidak valid
    if (!sheetEndIso) {
      perluDilengkapi.push({
        id: emp.id,
        nama_key: emp.nama_key,
        nama_asli: emp.nama_asli || emp.nama_key,
        nik_internal: emp.nik_internal || "-",
        posisi: emp.posisi || "-",
        divisi: emp.divisi || "-",
        lini_bisnis: emp.lini_bisnis || "-",
        unit: emp.unit || "-",
        status_karyawan: emp.status_karyawan || rawStatus,
        tanggal_masuk: emp.tanggal_masuk || null,
        tanggal_habis_kontrak: null,
      });
      continue;
    }

    const empDocs = contractsByEmployee.get(emp.nama_key) || [];

    // Cek apakah sudah diperpanjang: ada PKWT dengan tanggal_mulai >= tanggal akhir kontrak lama
    if (isContractRenewed(sheetEndIso, empDocs)) {
      // Sudah diperpanjang -> dikeluarkan dari daftar jatuh tempo
      continue;
    }

    // Cek apakah ada perbedaan tanggal berakhir antara Sheet dan dokumen aktif
    const activeDoc = empDocs[0] || null;
    const docEndIso = activeDoc ? toIsoDate(activeDoc.tanggal_berakhir) : null;
    let selisih_dokumen = null;
    if (docEndIso && docEndIso !== sheetEndIso) {
      selisih_dokumen = {
        sheet: sheetEndIso,
        dokumen: docEndIso,
      };
    }

    const sisa_hari = daysUntil(sheetEndIso, refIso);
    const bulan = sheetEndIso.slice(0, 7);

    const item = {
      id: emp.id,
      nama_key: emp.nama_key,
      nama_asli: emp.nama_asli || emp.nama_key,
      nik_internal: emp.nik_internal || "-",
      posisi: emp.posisi || "-",
      divisi: emp.divisi || "-",
      lini_bisnis: emp.lini_bisnis || "-",
      unit: emp.unit || "-",
      status_karyawan: emp.status_karyawan || rawStatus,
      tanggal_masuk: emp.tanggal_masuk || null,
      tanggal_habis_kontrak: sheetEndIso,
      tanggal_habis_id: formatIsoId(sheetEndIso),
      sisa_hari,
      bulan,
      selisih_dokumen,
      document_id: activeDoc?.id || null,
      nomor_surat: activeDoc?.nomor_surat || null,
      url: activeDoc?.url || null,
    };

    // Klasifikasi kategori waktu
    if (sisa_hari < 0) {
      lewat.push(item);
    } else {
      if (sisa_hari <= 7) {
        hari7.push(item);
      }
      if (sisa_hari <= 30) {
        hari30.push(item);
      }
    }

    if (bulan === thisMonth) {
      bulanIni.push(item);
    } else if (bulan === nextMonth) {
      bulanDepan.push(item);
    }

    // Kelompokkan per bulan
    if (!groupsMap.has(bulan)) {
      groupsMap.set(bulan, []);
    }
    groupsMap.get(bulan).push(item);
  }

  // Susun groups terurut kronologis bulan (asc)
  const sortedMonths = Array.from(groupsMap.keys()).sort();
  const groups = sortedMonths.map((bulan) => {
    const items = groupsMap.get(bulan) || [];
    // Urutkan item dalam bulan: sisa_hari ascending (yang jatuh tempo lebih awal di atas)
    items.sort((a, b) => a.sisa_hari - b.sisa_hari || a.nama_asli.localeCompare(b.nama_asli));
    return {
      bulan,
      label: getMonthLabel(bulan),
      items,
    };
  });

  // Pengurutan masing-masing kelompok ringkasan
  lewat.sort((a, b) => b.tanggal_habis_kontrak.localeCompare(a.tanggal_habis_kontrak));
  hari7.sort((a, b) => a.sisa_hari - b.sisa_hari);
  hari30.sort((a, b) => a.sisa_hari - b.sisa_hari);
  bulanIni.sort((a, b) => a.sisa_hari - b.sisa_hari);
  bulanDepan.sort((a, b) => a.sisa_hari - b.sisa_hari);
  perluDilengkapi.sort((a, b) => (a.nama_asli || "").localeCompare(b.nama_asli || ""));

  return {
    groups,
    lewat,
    hari7,
    hari30,
    bulanIni,
    bulanDepan,
    perluDilengkapi,
  };
}

/**
 * 1. getDueEmployees({ status, perusahaan, search, now })
 * Fungsi server utama untuk mengambil data jatuh tempo karyawan dari database dan dokumen terpadu.
 *
 * @param {Object} [options]
 * @param {string} [options.status]
 * @param {string} [options.perusahaan]
 * @param {string} [options.search]
 * @param {Date|string|number} [options.now]
 * @returns {Promise<{ groups: Array, lewat: Array, hari7: Array, hari30: Array, bulanIni: Array, bulanDepan: Array, perluDilengkapi: Array }>}
 */
export async function getDueEmployees({ status, perusahaan, search, now = new Date() } = {}) {
  // Ambil data karyawan dari database
  let empQuery = supabaseAdmin
    .from("employees")
    .select("id, nama_key, nama_asli, nik_internal, posisi, divisi, lini_bisnis, unit, status_karyawan, tanggal_masuk, tanggal_habis_kontrak")
    .order("nama_asli", { ascending: true })
    .limit(5000);

  const [empRes, unifiedRes] = await Promise.all([
    empQuery,
    getUnifiedContracts({ limit: 0, now }),
  ]);

  if (empRes.error) {
    console.error("Gagal membaca tabel employees untuk jatuh tempo:", friendlyDbError(empRes.error));
    // Jika kolom tanggal_habis_kontrak belum ada di DB, fallback tanpa error fatal
    if (/tanggal_habis_kontrak|column.*does not exist/i.test(empRes.error.message || "")) {
      const fallbackQuery = await supabaseAdmin
        .from("employees")
        .select("id, nama_key, nama_asli, nik_internal, posisi, divisi, lini_bisnis, unit, status_karyawan, tanggal_masuk")
        .order("nama_asli", { ascending: true })
        .limit(5000);
      const employees = (fallbackQuery.data || []).map((e) => ({ ...e, tanggal_habis_kontrak: null }));
      return processDueEmployees(employees, unifiedRes?.data || [], { status, perusahaan, search, now });
    }
    throw new Error(friendlyDbError(empRes.error));
  }

  const employees = empRes.data || [];
  const unifiedContracts = unifiedRes?.data || [];

  return processDueEmployees(employees, unifiedContracts, { status, perusahaan, search, now });
}

/**
 * 2. getRenewals({ bulan, basis, now })
 * Rekap bulanan perpanjangan kontrak.
 *
 * @param {Object} [options]
 * @param {string} [options.bulan] - Format YYYY-MM (misal "2026-11") atau "semua"
 * @param {string} [options.basis="mulai"] - "mulai" (berdasarkan tanggal_mulai) atau "dibuat" (created_at)
 * @param {Date|string|number} [options.now]
 * @returns {Promise<{ bulan: string, basis: string, total: number, items: Array, summary: Object, trend12Months: Array, availableMonths: Array }>}
 */
export async function getRenewals({ bulan, basis = "mulai", now = new Date() } = {}) {
  const refIso = now ? (toIsoDate(now) || getTodayWib(now)) : getTodayWib();
  const currentMonth = refIso.slice(0, 7);
  const targetMonth = bulan || currentMonth;

  // 1. Ambil seluruh kontrak terpadu dan data jatuh tempo karyawan
  const [unifiedRes, dueData] = await Promise.all([
    getUnifiedContracts({ limit: 0, now }),
    getDueEmployees({ now }),
  ]);

  const allContracts = unifiedRes?.data || [];

  // 2. Indeks kontrak per nama_key
  const contractsByEmployee = new Map();
  for (const c of allContracts) {
    const key = c.nama_key || (c.nama_asli ? normalizeName(c.nama_asli) : null);
    if (!key) continue;
    if (!contractsByEmployee.has(key)) {
      contractsByEmployee.set(key, []);
    }
    contractsByEmployee.get(key).push(c);
  }

  // 3. Cari seluruh perpanjangan
  const allRenewals = [];
  const availableMonthsSet = new Set();

  for (const [key, empContracts] of contractsByEmployee.entries()) {
    // Urutkan kronologis dari kontrak awal ke terbaru
    empContracts.sort((a, b) => {
      const startA = toIsoDate(a.tanggal_mulai) || "";
      const startB = toIsoDate(b.tanggal_mulai) || "";
      if (startA !== startB) return startA.localeCompare(startB);
      const createdA = a.created_at || "";
      const createdB = b.created_at || "";
      return createdA.localeCompare(createdB);
    });

    if (empContracts.length < 2) continue;

    for (let i = 1; i < empContracts.length; i++) {
      const prior = empContracts[i - 1];
      const current = empContracts[i];

      const priorEnd = toIsoDate(prior.tanggal_berakhir);
      const curStart = toIsoDate(current.tanggal_mulai);
      const curEnd = toIsoDate(current.tanggal_berakhir);

      // Definisi perpanjangan: tanggal_mulai >= tanggal_berakhir kontrak sebelumnya
      // ATAU perpanjangan_dari tercatat sama dengan id kontrak sebelumnya
      const isRenewal =
        (curStart && priorEnd && curStart >= priorEnd) ||
        (current.perpanjangan_dari && (current.perpanjangan_dari === prior.id || current.perpanjangan_dari === prior.source_id));

      if (!isRenewal) continue;

      // Tentukan bulan berdasarkan basis
      let renewalMonth = "";
      if (basis === "dibuat") {
        renewalMonth = current.created_at
          ? toIsoDate(current.created_at).slice(0, 7)
          : (curStart ? curStart.slice(0, 7) : "");
      } else {
        // basis === "mulai" (default)
        renewalMonth = curStart ? curStart.slice(0, 7) : "";
      }

      if (renewalMonth) {
        availableMonthsSet.add(renewalMonth);
      }

      let durasiBulan = current.jangka_bulan || null;
      if (!durasiBulan && curStart && curEnd) {
        const [y1, m1] = curStart.split("-").map(Number);
        const [y2, m2] = curEnd.split("-").map(Number);
        durasiBulan = Math.max((y2 - y1) * 12 + (m2 - m1), 1);
      }

      allRenewals.push({
        id: current.id,
        source_id: current.source_id,
        nama_asli: current.nama_asli || key,
        nama_key: key,
        perusahaan: current.kode_perusahaan || current.lini_bisnis || "-",
        lini_bisnis: current.lini_bisnis || current.kode_perusahaan || "-",
        perpanjangan_ke: i,
        urutan_kontrak: i + 1,
        perpanjangan_label: `Perpanjangan ke-${i}`,
        tanggal_akhir_lama: priorEnd,
        tanggal_akhir_lama_id: formatIsoId(priorEnd),
        tanggal_mulai_baru: curStart,
        tanggal_mulai_baru_id: formatIsoId(curStart),
        durasi_bulan: durasiBulan,
        tanggal_berakhir_baru: curEnd,
        tanggal_berakhir_baru_id: formatIsoId(curEnd),
        nomor_surat: current.nomor_surat || "-",
        status_dokumen: current.status_dokumen || "draft",
        url: current.url || null,
        sumber: current.sumber || "aplikasi",
        created_at: current.created_at || null,
        bulan: renewalMonth,
      });
    }
  }

  // 4. Hitung tren 12 bulan terakhir untuk grafik recharts
  const [currY, currM] = currentMonth.split("-").map(Number);
  const trend12Months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(currY, currM - 1 - i, 1);
    const mIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const mLabel = d.toLocaleDateString("id-ID", { month: "short", year: "2-digit" });
    const count = allRenewals.filter((r) => r.bulan === mIso).length;
    trend12Months.push({
      bulan: mIso,
      label: mLabel,
      total: count,
    });
  }

  // 5. Filter item berdasarkan bulan yang diminta
  let filteredItems = [];
  if (targetMonth && targetMonth !== "semua") {
    filteredItems = allRenewals.filter((r) => r.bulan === targetMonth);
  } else {
    filteredItems = allRenewals;
  }

  // Urutkan item: tanggal mulai baru descending (terbaru di atas)
  filteredItems.sort((a, b) => {
    const startA = a.tanggal_mulai_baru || "";
    const startB = b.tanggal_mulai_baru || "";
    return startB.localeCompare(startA) || a.nama_asli.localeCompare(b.nama_asli);
  });

  // 6. Ringkasan
  const totalPerpanjangan = filteredItems.length;
  const totalBulan = filteredItems.reduce((acc, r) => acc + (Number(r.durasi_bulan) || 0), 0);
  const rataRataBulan = totalPerpanjangan > 0 ? Number((totalBulan / totalPerpanjangan).toFixed(1)) : 0;

  // Hitung jumlah karyawan yang jatuh tempo di bulan itu tetapi belum diperpanjang
  let belumDiperpanjangCount = 0;
  if (targetMonth && targetMonth !== "semua") {
    const group = dueData?.groups?.find((g) => g.bulan === targetMonth);
    belumDiperpanjangCount = group ? group.items.length : 0;
  } else {
    belumDiperpanjangCount =
      (dueData?.groups?.flatMap((g) => g.items).length || 0) + (dueData?.lewat?.length || 0);
  }

  const availableMonths = Array.from(availableMonthsSet).sort();

  return {
    bulan: targetMonth,
    basis,
    total: totalPerpanjangan,
    items: filteredItems,
    summary: {
      totalPerpanjangan,
      totalBulan,
      rataRataBulan,
      belumDiperpanjangCount,
    },
    trend12Months,
    availableMonths,
  };
}

/**
 * 3. getDueSp({ perusahaan, search, now })
 * Mengambil daftar Surat Peringatan (SP) yang memiliki masa berlaku (tanggal_berakhir NOT NULL),
 * dikelompokkan per bulan berakhirnya dan dihitung sisa hari berlakunya.
 * SP tanpa masa berlaku (NULL) TIDAK diikutsertakan (hanya ada di riwayat dokumen).
 *
 * @param {Object} [options]
 * @param {string} [options.perusahaan]
 * @param {string} [options.search]
 * @param {Date|string|number} [options.now]
 * @returns {Promise<{ groups: Array, lewat: Array, hari7: Array, hari30: Array, bulanIni: Array, bulanDepan: Array, total: number, items: Array }>}
 */
export async function getDueSp({ perusahaan = null, search = null, now = new Date() } = {}) {
  const refIso = now ? (toIsoDate(now) || getTodayWib(now)) : getTodayWib();
  const { thisMonth, nextMonth } = getMonthOffsets(refIso);

  const filterPerusahaan = perusahaan && perusahaan !== "semua" ? normalizeLiniBisnis(perusahaan) : null;
  const filterSearch = search && String(search).trim() ? String(search).trim().toLowerCase() : null;

  const { data: logs, error } = await supabaseAdmin
    .from("document_logs")
    .select("id, employee_name, document_type, document_number, company_code, google_doc_url, created_at, tanggal_mulai, tanggal_berakhir, masa_berlaku_bulan, form_data")
    .eq("document_type", "sp")
    .not("tanggal_berakhir", "is", null)
    .order("tanggal_berakhir", { ascending: true })
    .limit(2000);

  if (error) {
    console.error("Gagal mengambil data SP jatuh tempo:", friendlyDbError(error));
    return {
      groups: [],
      lewat: [],
      hari7: [],
      hari30: [],
      bulanIni: [],
      bulanDepan: [],
      total: 0,
      items: [],
    };
  }

  const groupsMap = new Map();
  const lewat = [];
  const hari7 = [];
  const hari30 = [];
  const bulanIni = [];
  const bulanDepan = [];
  const allItems = [];

  for (const log of logs || []) {
    const endIso = toIsoDate(log.tanggal_berakhir);
    if (!endIso) continue;

    const comp = log.company_code ? normalizeLiniBisnis(log.company_code) : "";
    if (filterPerusahaan && comp !== filterPerusahaan) {
      continue;
    }

    const empName = log.employee_name || log.form_data?.nama_karyawan || "-";
    const docNo = log.document_number || "";
    if (filterSearch) {
      const matchName = empName.toLowerCase().includes(filterSearch);
      const matchDoc = docNo.toLowerCase().includes(filterSearch);
      if (!matchName && !matchDoc) {
        continue;
      }
    }

    const rawTingkat = log.form_data?.tingkat_sp || "";
    let tingkat = "SP";
    if (rawTingkat.includes("1") || docNo.includes("/SP.1") || docNo.includes("/SP1")) {
      tingkat = "SP 1";
    } else if (rawTingkat.includes("2") || docNo.includes("/SP.2") || docNo.includes("/SP2")) {
      tingkat = "SP 2";
    } else if (rawTingkat.includes("3") || docNo.includes("/SP.3") || docNo.includes("/SP3")) {
      tingkat = "SP 3";
    } else if (rawTingkat) {
      tingkat = rawTingkat;
    }

    const sisa_hari = daysUntil(endIso, refIso);
    const bulan = endIso.slice(0, 7);

    const item = {
      id: log.id,
      employee_name: empName,
      nama_asli: empName,
      document_number: docNo,
      tingkat_sp: tingkat,
      company_code: log.company_code || "-",
      lini_bisnis: log.company_code || "-",
      departemen: log.form_data?.departemen || "-",
      jabatan: log.form_data?.jabatan || "-",
      pelanggaran: log.form_data?.pelanggaran || "-",
      tanggal_mulai: log.tanggal_mulai ? toIsoDate(log.tanggal_mulai) : toIsoDate(log.created_at),
      tanggal_sp: log.tanggal_mulai ? toIsoDate(log.tanggal_mulai) : toIsoDate(log.created_at),
      tanggal_berakhir: endIso,
      tanggal_berakhir_id: formatIsoId(endIso),
      masa_berlaku_bulan: log.masa_berlaku_bulan || null,
      sisa_hari,
      bulan,
      google_doc_url: log.google_doc_url,
    };

    allItems.push(item);

    if (sisa_hari < 0) {
      lewat.push(item);
    } else {
      if (sisa_hari <= 7) {
        hari7.push(item);
      }
      if (sisa_hari <= 30) {
        hari30.push(item);
      }
    }

    if (bulan === thisMonth) {
      bulanIni.push(item);
    } else if (bulan === nextMonth) {
      bulanDepan.push(item);
    }

    if (!groupsMap.has(bulan)) {
      groupsMap.set(bulan, []);
    }
    groupsMap.get(bulan).push(item);
  }

  const sortedMonths = Array.from(groupsMap.keys()).sort();
  const groups = sortedMonths.map((bulan) => {
    const items = groupsMap.get(bulan) || [];
    items.sort((a, b) => a.sisa_hari - b.sisa_hari || a.employee_name.localeCompare(b.employee_name));
    return {
      bulan,
      label: getMonthLabel(bulan),
      items,
    };
  });

  return {
    groups,
    lewat,
    hari7,
    hari30,
    bulanIni,
    bulanDepan,
    total: allItems.length,
    items: allItems,
  };
}
