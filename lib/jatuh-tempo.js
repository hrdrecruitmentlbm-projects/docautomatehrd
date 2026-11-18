import { supabaseAdmin, friendlyDbError } from "./supabase.js";
import { getUnifiedContracts } from "./pkwt-unified.js";
import {
  daysUntil,
  toIsoDate,
  formatIsoId,
  getTodayWib,
  getMonthOffsets,
  getMonthLabel,
  getAdjacentMonthIso,
  addDaysIso,
} from "./contract-lifecycle.js";
import { BULAN_ID, normalizeName, normalizeLiniBisnis } from "./pkwt.js";

export { getTodayWib, getMonthOffsets, getMonthLabel };

/** Status karyawan yang memiliki masa berlaku kontrak / tanggal habis kontrak. */
export const STATUS_DENGAN_KONTRAK = ["PKWT", "FREELANCE", "TRAINING"];

/**
 * Klasifikasikan status_karyawan dari master sheet menjadi kategori standar
 * ("PKWT" | "FREELANCE" | "TRAINING") atau null (PKWTT / Tetap / lainnya).
 */
export function classifyContractStatus(rawStatus) {
  const upper = String(rawStatus || "").trim().replace(/\s+/g, " ").toUpperCase();
  if (!upper) return null;
  if (/\b(PKWTT|TETAP|TIDAK\s*AKTIF|NON\s*-?\s*AKTIF|NONAKTIF|RESIGN|KELUAR|BERHENTI)\b/.test(upper)) {
    return null;
  }
  if (
    upper === "PKWT" ||
    /^PKWT[\s\-/]*(?:[0-9]+|[IVX]+|\(.*\))?$/.test(upper) ||
    upper === "KONTRAK"
  ) {
    return "PKWT";
  }
  if (upper.includes("FREELANCE")) return "FREELANCE";
  if (upper.includes("TRAINING")) return "TRAINING";
  return null;
}

/**
 * Mencari kontrak PKWT baru (perpanjangan) untuk karyawan yang sama
 * dengan tanggal_mulai >= tanggal_berakhir kontrak lama.
 * Mengembalikan objek kontrak perpanjangan terbaru jika ada, atau null.
 *
 * @param {string} targetEndDateIso - Tanggal berakhir kontrak lama (ISO YYYY-MM-DD)
 * @param {Array} employeeContracts - Daftar kontrak milik karyawan
 * @param {string|null} [excludeContractId=null] - ID kontrak lama (opsional)
 * @returns {Object|null}
 */
export function findRenewalContract(targetEndDateIso, employeeContracts = [], excludeContractId = null) {
  const endIso = toIsoDate(targetEndDateIso);
  if (!endIso) return null;

  const matches = (employeeContracts || []).filter((other) => {
    if (!other?.tanggal_mulai) return false;
    const otherStartIso = toIsoDate(other.tanggal_mulai);
    if (!otherStartIso) return false;

    if (excludeContractId && (other.id === excludeContractId || other.source_id === excludeContractId)) {
      return false;
    }

    return otherStartIso >= endIso;
  });

  if (matches.length === 0) return null;

  matches.sort((a, b) => {
    const endA = toIsoDate(a.tanggal_berakhir) || "";
    const endB = toIsoDate(b.tanggal_berakhir) || "";
    if (endA !== endB) return endB.localeCompare(endA);
    const startA = toIsoDate(a.tanggal_mulai) || "";
    const startB = toIsoDate(b.tanggal_mulai) || "";
    return startB.localeCompare(startA);
  });

  return matches[0];
}

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
  return Boolean(findRenewalContract(targetEndDateIso, employeeContracts, excludeContractId));
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
 * @param {boolean} [filters.includeRenewed=false] - Jika true, groups menyertakan karyawan yang sudah diperpanjang beserta statusnya
 * @returns {{ groups: Array, ringkasan12Bulan: Array, lewat: Array, hari7: Array, hari30: Array, bulanIni: Array, bulanDepan: Array, perluDilengkapi: Array }}
 */
export function processDueEmployees(
  employees = [],
  unifiedContracts = [],
  { status = null, perusahaan = null, search = null, now = null, includeRenewed = false } = {}
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
    const contractCategory = classifyContractStatus(rawStatus);

    // HANYA karyawan berstatus PKWT/FREELANCE/TRAINING yang memiliki tanggal akhir kontrak.
    // PKWTT TIDAK IKUT sama sekali di bulan mana pun.
    if (!contractCategory) {
      continue;
    }

    // Filter status jika diminta
    if (filterStatus && contractCategory !== filterStatus && rawStatus !== filterStatus) {
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
        id: emp.id || emp.nama_key,
        nama_key: emp.nama_key,
        nama_asli: emp.nama_asli || emp.nama_key,
        nik_internal: emp.nik_internal || "-",
        posisi: emp.posisi || "-",
        divisi: emp.divisi || "-",
        lini_bisnis: emp.lini_bisnis || "-",
        unit: emp.unit || "-",
        status_karyawan: emp.status_karyawan || contractCategory,
        status_kategori: contractCategory,
        tanggal_masuk: emp.tanggal_masuk || null,
        tanggal_habis_kontrak: null,
      });
      continue;
    }

    const empDocs = contractsByEmployee.get(emp.nama_key) || [];

    // Cek apakah sudah diperpanjang: ada PKWT dengan tanggal_mulai >= tanggal akhir kontrak lama
    const renewalDoc = findRenewalContract(sheetEndIso, empDocs);
    const sudah_diperpanjang = Boolean(renewalDoc);

    // Untuk mode ringkas (Dashboard / notifikasi tindakan), karyawan yang sudah diperpanjang dilewati
    if (!includeRenewed && sudah_diperpanjang) {
      continue;
    }

    // Cek apakah ada perbedaan tanggal berakhir antara Sheet dan dokumen aktif
    const activeDoc = empDocs[0] || null;
    const docEndIso = activeDoc ? toIsoDate(activeDoc.tanggal_berakhir) : null;
    let selisih_dokumen = null;
    if (!sudah_diperpanjang && docEndIso && docEndIso !== sheetEndIso) {
      selisih_dokumen = {
        sheet: sheetEndIso,
        dokumen: docEndIso,
      };
    }

    const renewalStartIso = renewalDoc ? toIsoDate(renewalDoc.tanggal_mulai) : null;
    const renewalEndIso = renewalDoc ? toIsoDate(renewalDoc.tanggal_berakhir) : null;

    const sisa_hari = daysUntil(sheetEndIso, refIso);
    const bulan = sheetEndIso.slice(0, 7);

    const item = {
      id: emp.id || emp.nama_key,
      nama_key: emp.nama_key,
      nama_asli: emp.nama_asli || emp.nama_key,
      nik_internal: emp.nik_internal || "-",
      posisi: emp.posisi || "-",
      divisi: emp.divisi || "-",
      lini_bisnis: emp.lini_bisnis || "-",
      unit: emp.unit || "-",
      status_karyawan: emp.status_karyawan || contractCategory,
      status_kategori: contractCategory,
      tanggal_masuk: emp.tanggal_masuk || null,
      tanggal_habis_kontrak: sheetEndIso,
      tanggal_habis_id: formatIsoId(sheetEndIso),
      sisa_hari,
      bulan,
      sudah_diperpanjang,
      tanggal_mulai_baru: renewalStartIso,
      tanggal_berakhir_baru: renewalEndIso,
      tanggal_berakhir_baru_id: renewalEndIso ? formatIsoId(renewalEndIso) : null,
      renewal_doc_id: renewalDoc?.id || null,
      renewal_nomor_surat: renewalDoc?.nomor_surat || null,
      renewal_url: renewalDoc?.url || null,
      selisih_dokumen,
      document_id: activeDoc?.id || null,
      nomor_surat: activeDoc?.nomor_surat || null,
      url: activeDoc?.url || null,
    };

    // Klasifikasi kategori tindakan cepat — HANYA yang BELUM diperpanjang
    if (!sudah_diperpanjang) {
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
    // Urutkan item dalam bulan: tanggal habis kontrak ascending, lalu nama ascending
    items.sort((a, b) => a.sisa_hari - b.sisa_hari || a.nama_asli.localeCompare(b.nama_asli));
    const sudahCount = items.filter((i) => i.sudah_diperpanjang).length;
    const belumCount = items.length - sudahCount;
    return {
      bulan,
      label: getMonthLabel(bulan),
      items,
      total: items.length,
      sudahDiperpanjang: sudahCount,
      belumDiperpanjang: belumCount,
    };
  });

  // Ringkasan 12 bulan: mulai 3 bulan lalu sampai 9 bulan ke depan (offset -3 .. +8)
  const ringkasan12Bulan = [];
  for (let offset = -3; offset <= 8; offset++) {
    const mIso = getAdjacentMonthIso(thisMonth, offset);
    const items = groupsMap.get(mIso) || [];
    const sudahCount = items.filter((i) => i.sudah_diperpanjang).length;
    const belumCount = items.length - sudahCount;
    ringkasan12Bulan.push({
      bulan: mIso,
      label: getMonthLabel(mIso),
      isCurrent: offset === 0,
      isPast: offset < 0,
      total: items.length,
      sudahDiperpanjang: sudahCount,
      belumDiperpanjang: belumCount,
    });
  }

  // Pengurutan masing-masing kelompok ringkasan
  lewat.sort((a, b) => b.tanggal_habis_kontrak.localeCompare(a.tanggal_habis_kontrak));
  hari7.sort((a, b) => a.sisa_hari - b.sisa_hari);
  hari30.sort((a, b) => a.sisa_hari - b.sisa_hari);
  bulanIni.sort((a, b) => a.sisa_hari - b.sisa_hari);
  bulanDepan.sort((a, b) => a.sisa_hari - b.sisa_hari);
  perluDilengkapi.sort((a, b) => (a.nama_asli || "").localeCompare(b.nama_asli || ""));

  return {
    groups,
    ringkasan12Bulan,
    lewat,
    hari7,
    hari30,
    bulanIni,
    bulanDepan,
    perluDilengkapi,
  };
}

/**
 * 1. getDueEmployees({ status, perusahaan, search, now, includeRenewed })
 * Fungsi server utama untuk mengambil data jatuh tempo karyawan dari database dan dokumen terpadu.
 *
 * @param {Object} [options]
 * @param {string} [options.status]
 * @param {string} [options.perusahaan]
 * @param {string} [options.search]
 * @param {Date|string|number} [options.now]
 * @param {boolean} [options.includeRenewed=false]
 * @returns {Promise<{ groups: Array, ringkasan12Bulan: Array, lewat: Array, hari7: Array, hari30: Array, bulanIni: Array, bulanDepan: Array, perluDilengkapi: Array }>}
 */
export async function getDueEmployees({
  status,
  perusahaan,
  search,
  now = new Date(),
  includeRenewed = false,
} = {}) {
  // Ambil data karyawan dari database (primary key tabel employees adalah nama_key, tidak ada kolom id)
  let empQuery = supabaseAdmin
    .from("employees")
    .select("nama_key, nama_asli, nik_internal, posisi, divisi, lini_bisnis, unit, status_karyawan, tanggal_masuk, tanggal_habis_kontrak")
    .order("nama_asli", { ascending: true })
    .limit(5000);

  const [empRes, unifiedRes] = await Promise.all([
    empQuery,
    getUnifiedContracts({ limit: 0, now }),
  ]);

  if (empRes.error) {
    console.error("Gagal membaca tabel employees untuk jatuh tempo:", empRes.error.message || friendlyDbError(empRes.error));
    // Hanya fallback bila benar-benar kolom tanggal_habis_kontrak belum dimigrasi di DB
    if (/tanggal_habis_kontrak/i.test(empRes.error.message || "")) {
      const fallbackQuery = await supabaseAdmin
        .from("employees")
        .select("nama_key, nama_asli, nik_internal, posisi, divisi, lini_bisnis, unit, status_karyawan, tanggal_masuk")
        .order("nama_asli", { ascending: true })
        .limit(5000);

      if (fallbackQuery.error) {
        throw new Error(friendlyDbError(fallbackQuery.error));
      }

      const employees = (fallbackQuery.data || []).map((e) => ({ ...e, tanggal_habis_kontrak: null }));
      const processed = processDueEmployees(employees, unifiedRes?.data || [], {
        status,
        perusahaan,
        search,
        now,
        includeRenewed,
      });
      return {
        ...processed,
        dbWarning:
          "Kolom tanggal_habis_kontrak belum tersedia di database. Jalankan supabase/jatuh-tempo.sql lalu sync ulang master.",
      };
    }
    throw new Error(friendlyDbError(empRes.error));
  }

  const employees = empRes.data || [];
  const unifiedContracts = unifiedRes?.data || [];

  return processDueEmployees(employees, unifiedContracts, {
    status,
    perusahaan,
    search,
    now,
    includeRenewed,
  });
}

/**
 * Logika murni perhitungan rekap perpanjangan kontrak (dapat diuji tanpa database).
 *
 * Mendeteksi perpanjangan dari dua skenario yang sah:
 *   1. Ada >= 2 kontrak PKWT karyawan di document_logs / pkwt_source dengan
 *      tanggal_mulai >= tanggal_berakhir kontrak sebelumnya (atau perpanjangan_dari).
 *   2. Kontrak baru di document_logs / pkwt_source yang memperpanjang tanggal_habis_kontrak
 *      dari Bank Data Karyawan (saat kontrak lamanya belum ada di document_logs / pkwt_source),
 *      atau memiliki perpanjangan_dari eksplisit.
 */
export function processRenewals(
  allContracts = [],
  dueData = {},
  { bulan, basis = "mulai", now = new Date() } = {}
) {
  const refIso = now ? (toIsoDate(now) || getTodayWib(now)) : getTodayWib();
  const currentMonth = refIso.slice(0, 7);
  const targetMonth = bulan || currentMonth;

  const allDueItems = (dueData?.groups || []).flatMap((g) => g.items || []);
  const sheetEndByKey = new Map();
  for (const item of allDueItems) {
    if (item?.nama_key && item?.tanggal_habis_kontrak && !sheetEndByKey.has(item.nama_key)) {
      sheetEndByKey.set(item.nama_key, item.tanggal_habis_kontrak);
    }
  }

  // Indeks kontrak per nama_key
  const contractsByEmployee = new Map();
  for (const c of allContracts || []) {
    const key = c.nama_key || (c.nama_asli ? normalizeName(c.nama_asli) : null);
    if (!key) continue;
    if (!contractsByEmployee.has(key)) {
      contractsByEmployee.set(key, []);
    }
    contractsByEmployee.get(key).push(c);
  }

  const allRenewals = [];
  const availableMonthsSet = new Set();

  const resolveMonth = (current, curStart) => {
    if (basis === "dibuat") {
      if (current.created_at) {
        const wib = getTodayWib(current.created_at);
        if (wib && /^\d{4}-\d{2}/.test(wib)) return wib.slice(0, 7);
      }
      return curStart ? curStart.slice(0, 7) : "";
    }
    return curStart ? curStart.slice(0, 7) : "";
  };

  const resolveDuration = (current, curStart, curEnd) => {
    let durasiBulan = current.jangka_bulan || null;
    if (!durasiBulan && curStart && curEnd) {
      const [y1, m1] = curStart.split("-").map(Number);
      const [y2, m2] = curEnd.split("-").map(Number);
      durasiBulan = Math.max((y2 - y1) * 12 + (m2 - m1), 1);
    }
    return durasiBulan;
  };

  for (const [key, empContracts] of contractsByEmployee.entries()) {
    empContracts.sort((a, b) => {
      const startA = toIsoDate(a.tanggal_mulai) || "";
      const startB = toIsoDate(b.tanggal_mulai) || "";
      if (startA !== startB) return startA.localeCompare(startB);
      const createdA = a.created_at || "";
      const createdB = b.created_at || "";
      return createdA.localeCompare(createdB);
    });

    const empSheetEnd = sheetEndByKey.get(key) || null;
    let renewalSeq = 0;

    for (let i = 0; i < empContracts.length; i++) {
      const current = empContracts[i];
      const curStart = toIsoDate(current.tanggal_mulai);
      const curEnd = toIsoDate(current.tanggal_berakhir);

      let isRenewal = false;
      let priorEnd = null;

      if (i === 0) {
        const isExplicit = Boolean(current.perpanjangan_dari);
        const isSheetFollowUp = Boolean(empSheetEnd && curStart && curStart >= empSheetEnd);
        if (isExplicit || isSheetFollowUp) {
          isRenewal = true;
          priorEnd = empSheetEnd || null;
        }
      } else {
        const prior = empContracts[i - 1];
        const prevDocEnd = toIsoDate(prior.tanggal_berakhir);
        const isDateRenewal = Boolean(curStart && prevDocEnd && curStart >= prevDocEnd);
        const isExplicitLink = Boolean(
          current.perpanjangan_dari &&
            (current.perpanjangan_dari === prior.id ||
              String(current.perpanjangan_dari) === String(prior.source_id))
        );
        const isSheetFollowUp = Boolean(
          renewalSeq === 0 &&
            empSheetEnd &&
            curStart &&
            curStart >= empSheetEnd &&
            (!prevDocEnd || prevDocEnd <= empSheetEnd)
        );
        if (isDateRenewal || isExplicitLink || isSheetFollowUp) {
          isRenewal = true;
          priorEnd = prevDocEnd || empSheetEnd || null;
        }
      }

      if (!isRenewal) continue;

      renewalSeq += 1;
      const renewalMonth = resolveMonth(current, curStart);
      if (renewalMonth) {
        availableMonthsSet.add(renewalMonth);
      }

      const durasiBulan = resolveDuration(current, curStart, curEnd);

      allRenewals.push({
        id: current.id,
        source_id: current.source_id,
        nama_asli: current.nama_asli || key,
        nama_key: key,
        perusahaan: current.kode_perusahaan || current.lini_bisnis || "-",
        lini_bisnis: current.lini_bisnis || current.kode_perusahaan || "-",
        perpanjangan_ke: renewalSeq,
        urutan_kontrak: renewalSeq + 1,
        perpanjangan_label: `Perpanjangan ke-${renewalSeq}`,
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

  // Hitung tren 12 bulan terakhir (kalender murni)
  const trend12Months = [];
  for (let i = 11; i >= 0; i--) {
    const mIso = getAdjacentMonthIso(currentMonth, -i);
    const [yStr, mStr] = mIso.split("-");
    const mLabel = `${BULAN_ID[Number(mStr) - 1].slice(0, 3)} ${yStr.slice(2)}`;
    const count = allRenewals.filter((r) => r.bulan === mIso).length;
    trend12Months.push({
      bulan: mIso,
      label: mLabel,
      total: count,
    });
  }

  let filteredItems = [];
  if (targetMonth && targetMonth !== "semua") {
    filteredItems = allRenewals.filter((r) => r.bulan === targetMonth);
  } else {
    filteredItems = allRenewals;
  }

  filteredItems.sort((a, b) => {
    const startA = a.tanggal_mulai_baru || "";
    const startB = b.tanggal_mulai_baru || "";
    return startB.localeCompare(startA) || a.nama_asli.localeCompare(b.nama_asli);
  });

  const totalPerpanjangan = filteredItems.length;
  const totalBulan = filteredItems.reduce((acc, r) => acc + (Number(r.durasi_bulan) || 0), 0);
  const rataRataBulan = totalPerpanjangan > 0 ? Number((totalBulan / totalPerpanjangan).toFixed(1)) : 0;

  let belumDiperpanjangCount = 0;
  if (targetMonth && targetMonth !== "semua") {
    const group = dueData?.groups?.find((g) => g.bulan === targetMonth);
    belumDiperpanjangCount = group
      ? group.items.filter((i) => !i.sudah_diperpanjang).length
      : 0;
  } else {
    belumDiperpanjangCount = allDueItems.filter((i) => !i.sudah_diperpanjang).length;
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
 * 2. getRenewals({ bulan, basis, now })
 * Rekap bulanan perpanjangan kontrak.
 */
export async function getRenewals({ bulan, basis = "mulai", now = new Date() } = {}) {
  const [unifiedRes, dueData] = await Promise.all([
    getUnifiedContracts({ limit: 0, now }),
    getDueEmployees({ includeRenewed: true, now }),
  ]);

  return processRenewals(unifiedRes?.data || [], dueData, { bulan, basis, now });
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
