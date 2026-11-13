import { supabaseAdmin } from "./supabase.js";
import {
  toIsoDate,
  stateKeyKontrak,
  contractMeta,
  daysUntil,
  monthsUntil,
} from "./contract-lifecycle.js";
import { normalizeName, normalizeLiniBisnis } from "./pkwt.js";
import { calculateMonthsDiff } from "./scan-extractor.js";

/**
 * Normalisasi satu baris data dari document_logs (sumber: 'aplikasi')
 */
export function normalizeAppLog(log, now = new Date()) {
  const fileId = log.google_doc_id ? String(log.google_doc_id).trim() : null;
  const start = toIsoDate(log.tanggal_mulai);
  let end = toIsoDate(log.tanggal_berakhir);
  let jangkaBulan = log.jangka_bulan || null;

  if (!jangkaBulan && start && end) {
    jangkaBulan = calculateMonthsDiff(start, end);
  }

  const namaAsli = log.employee_name || "";
  const namaKey =
    log.employee_nama_key || (namaAsli ? normalizeName(namaAsli) : null);
  const companyCode =
    log.company_code || (log.lini_bisnis ? normalizeLiniBisnis(log.lini_bisnis) : null);

  const stateKey = stateKeyKontrak(end, now);
  const meta = contractMeta(stateKey);

  return {
    id: `app_${log.id}`,
    source_id: log.id,
    sumber: "aplikasi",
    file_id: fileId,
    nomor_surat: log.document_number || null,
    sequence_number: log.sequence_number || null,
    nama_asli: namaAsli || null,
    nama_key: namaKey,
    kode_perusahaan: companyCode,
    lini_bisnis: log.lini_bisnis || companyCode || null,
    bulan_folder: null,
    periode_bulan: log.periode_bulan || null,
    tanggal_mulai: start,
    tanggal_berakhir: end,
    jangka_bulan: jangkaBulan,
    status_dokumen: log.status_dokumen || "draft",
    state_kontrak: stateKey,
    state_meta: meta,
    sisa_hari: daysUntil(end, now),
    sisa_bulan: monthsUntil(end, now),
    url:
      log.google_doc_url ||
      (fileId ? `https://docs.google.com/document/d/${fileId}/edit` : null),
    created_at: log.created_at || null,
    user_email: log.user_email || null,
    unfilled_marks: log.unfilled_marks || [],
    perlu_dicek: false,
    alasan_cek: null,
    manual_override: false,
  };
}

/**
 * Normalisasi satu baris data dari pkwt_source (sumber: 'drive')
 */
export function normalizeDriveSource(src, now = new Date()) {
  const fileId = src.file_id ? String(src.file_id).trim() : null;
  const start = toIsoDate(src.tanggal_mulai);
  let end = toIsoDate(src.tanggal_berakhir);
  let jangkaBulan = src.jangka_bulan || null;

  if (!jangkaBulan && start && end) {
    jangkaBulan = calculateMonthsDiff(start, end);
  }

  const namaAsli = src.nama_asli || "";
  const namaKey =
    src.nama_key || (namaAsli ? normalizeName(namaAsli) : null);
  const companyCode = src.kode_perusahaan
    ? normalizeLiniBisnis(src.kode_perusahaan)
    : null;

  const stateKey = stateKeyKontrak(end, now);
  const meta = contractMeta(stateKey);

  return {
    id: `drive_${src.id}`,
    source_id: src.id,
    sumber: "drive",
    file_id: fileId,
    nomor_surat: src.nomor_surat || null,
    sequence_number: null,
    nama_asli: namaAsli || null,
    nama_key: namaKey,
    kode_perusahaan: companyCode,
    lini_bisnis: companyCode,
    bulan_folder: src.bulan_folder || null,
    periode_bulan: null,
    tanggal_mulai: start,
    tanggal_berakhir: end,
    jangka_bulan: jangkaBulan,
    status_dokumen: "arsip", // Dokumen fisik/arsip dari Drive
    state_kontrak: stateKey,
    state_meta: meta,
    sisa_hari: daysUntil(end, now),
    sisa_bulan: monthsUntil(end, now),
    url:
      src.url ||
      (fileId ? `https://docs.google.com/document/d/${fileId}/edit` : null),
    created_at: src.scanned_at || src.drive_modified_time || null,
    user_email: null,
    unfilled_marks: [],
    perlu_dicek: Boolean(src.perlu_dicek),
    alasan_cek: src.alasan_cek || null,
    manual_override: Boolean(src.manual_override),
  };
}

/**
 * Menggabungkan dan mendeduplikasi data kontrak dari document_logs dan pkwt_source.
 *
 * Aturan Dedup:
 * 1. Kunci Utama: file_id (Google Doc ID).
 * 2. Kunci Cadangan: bila salah satu tidak punya file_id, gunakan composite (nama_key, tanggal_mulai).
 * 3. Prioritas: bila ada di kedua sumber, tampilkan SATU baris dan utamakan document_logs
 *    (memiliki status_dokumen siklus administratif, audit user, dsb.).
 */
export function deduplicateContracts(appLogs = [], driveSources = [], now = new Date()) {
  const unifiedMap = new Map(); // primaryKey -> contract
  const fileIdToKey = new Map(); // file_id -> primaryKey
  const fallbackToKey = new Map(); // `${nama_key}|${tanggal_mulai}` -> primaryKey

  // 1. Masukkan semua dokumen dari document_logs (sumber: 'aplikasi')
  for (const log of appLogs) {
    const item = normalizeAppLog(log, now);

    const primaryKey = item.file_id
      ? `fid:${item.file_id}`
      : `fb:${item.nama_key || "unknown"}|${item.tanggal_mulai || "unknown"}_${item.source_id}`;

    unifiedMap.set(primaryKey, item);

    if (item.file_id) {
      fileIdToKey.set(item.file_id, primaryKey);
    }
    if (item.nama_key && item.tanggal_mulai) {
      fallbackToKey.set(`${item.nama_key}|${item.tanggal_mulai}`, primaryKey);
    }
  }

  // 2. Gabungkan data dari pkwt_source (sumber: 'drive') dengan dedup
  for (const src of driveSources) {
    const item = normalizeDriveSource(src, now);

    let matchKey = null;

    // Cek Kunci Utama: file_id
    if (item.file_id && fileIdToKey.has(item.file_id)) {
      matchKey = fileIdToKey.get(item.file_id);
    }

    // Cek Kunci Cadangan: (nama_key, tanggal_mulai)
    if (!matchKey && item.nama_key && item.tanggal_mulai) {
      const fbKey = `${item.nama_key}|${item.tanggal_mulai}`;
      if (fallbackToKey.has(fbKey)) {
        matchKey = fallbackToKey.get(fbKey);
      }
    }

    if (matchKey) {
      // DUPLIKAT DITEMUKAN: Utamakan document_logs!
      // Perkaya baris aplikasi dengan metadata arsip Drive jika ada yang kosong
      const existing = unifiedMap.get(matchKey);
      if (existing) {
        if (!existing.bulan_folder && item.bulan_folder) {
          existing.bulan_folder = item.bulan_folder;
        }
        if (!existing.file_id && item.file_id) {
          existing.file_id = item.file_id;
          fileIdToKey.set(item.file_id, matchKey);
        }
        if (item.manual_override) {
          existing.manual_override = true;
        }
      }
      // Jangan membuat baris baru
      continue;
    }

    // DOKUMEN HANYA ADA DI DRIVE: Tambahkan sebagai baris baru
    const primaryKey = item.file_id
      ? `fid:${item.file_id}`
      : `fb:${item.nama_key || "unknown"}|${item.tanggal_mulai || "unknown"}_${item.source_id}`;

    unifiedMap.set(primaryKey, item);

    if (item.file_id) {
      fileIdToKey.set(item.file_id, primaryKey);
    }
    if (item.nama_key && item.tanggal_mulai) {
      fallbackToKey.set(`${item.nama_key}|${item.tanggal_mulai}`, primaryKey);
    }
  }

  return Array.from(unifiedMap.values());
}

/**
 * Filter dan pencarian data kontrak
 */
export function filterContracts(
  contracts = [],
  { periode, perusahaan, status, sumber, search, perlu_dicek } = {}
) {
  return contracts.filter((c) => {
    // 1. Filter Sumber ('aplikasi' | 'drive' | 'semua')
    if (sumber && sumber !== "semua") {
      if (c.sumber !== String(sumber).toLowerCase()) return false;
    }

    // 2. Filter Status (state_kontrak: 'aktif'|'segera'|'kedaluwarsa'|'terbuka' ATAU status_dokumen: 'draft'|'dikirim'|'ditandatangani'|'arsip' ATAU status segera_30|segera_60|segera_90)
    if (status && status !== "semua") {
      const s = String(status).toLowerCase();
      if (s === "segera_30" || s === "30") {
        if (!(c.sisa_hari !== null && c.sisa_hari >= 0 && c.sisa_hari <= 30)) return false;
      } else if (s === "segera_60" || s === "60") {
        if (!(c.sisa_hari !== null && c.sisa_hari >= 0 && c.sisa_hari <= 60)) return false;
      } else if (s === "segera_90" || s === "90") {
        if (!(c.sisa_hari !== null && c.sisa_hari >= 0 && c.sisa_hari <= 90)) return false;
      } else {
        const matchState = c.state_kontrak === s;
        const matchDocStatus = c.status_dokumen === s;
        if (!matchState && !matchDocStatus) return false;
      }
    }

    // 2b. Filter Perlu Dicek
    if (perlu_dicek !== undefined && perlu_dicek !== null && perlu_dicek !== "") {
      const wantCheck =
        perlu_dicek === true ||
        String(perlu_dicek).toLowerCase() === "true" ||
        String(perlu_dicek) === "1";
      if (Boolean(c.perlu_dicek) !== wantCheck) return false;
    }

    // 3. Filter Perusahaan (kode_perusahaan / lini_bisnis)
    if (perusahaan && perusahaan !== "semua") {
      const targetCompany = normalizeLiniBisnis(perusahaan);
      const rowCompany = c.kode_perusahaan
        ? normalizeLiniBisnis(c.kode_perusahaan)
        : "";
      const rowLine = c.lini_bisnis ? normalizeLiniBisnis(c.lini_bisnis) : "";
      if (rowCompany !== targetCompany && rowLine !== targetCompany) {
        return false;
      }
    }

    // 4. Filter Periode (mis. "2026-11", "November 2026", dsb.)
    if (periode && periode !== "semua") {
      const p = String(periode).trim().toLowerCase();
      const matchBulanFolder = c.bulan_folder
        ? c.bulan_folder.toLowerCase().includes(p)
        : false;
      const matchPeriodeBulan = c.periode_bulan
        ? c.periode_bulan.toLowerCase().includes(p)
        : false;
      const matchStart = c.tanggal_mulai
        ? c.tanggal_mulai.toLowerCase().includes(p)
        : false;
      const matchEnd = c.tanggal_berakhir
        ? c.tanggal_berakhir.toLowerCase().includes(p)
        : false;

      if (!matchBulanFolder && !matchPeriodeBulan && !matchStart && !matchEnd) {
        return false;
      }
    }

    // 5. Pencarian Nama / Nomor Surat
    if (search && String(search).trim()) {
      const q = String(search).trim().toLowerCase();
      const matchNama = c.nama_asli ? c.nama_asli.toLowerCase().includes(q) : false;
      const matchKey = c.nama_key ? c.nama_key.toLowerCase().includes(q) : false;
      const matchNomor = c.nomor_surat ? c.nomor_surat.toLowerCase().includes(q) : false;
      if (!matchNama && !matchKey && !matchNomor) return false;
    }

    return true;
  });
}

/**
 * Helper Server Utama: getUnifiedContracts
 *
 * Mengambil, menggabungkan, mendeduplikasi, memfilter, dan mempaginasi
 * data kontrak PKWT dari document_logs dan pkwt_source.
 *
 * @param {Object} options
 * @param {string} [options.periode]
 * @param {string} [options.perusahaan]
 * @param {string} [options.status]
 * @param {string} [options.sumber] - 'aplikasi' | 'drive' | 'semua'
 * @param {string} [options.search]
 * @param {number} [options.page=1]
 * @param {number} [options.limit=50] - Set 0 atau null untuk semua baris
 * @param {Date|number|string} [options.now=new Date()]
 * @param {string} [options.sortBy="tanggal_berakhir"]
 * @param {string} [options.sortOrder="desc"]
 */
export async function getUnifiedContracts({
  periode,
  perusahaan,
  status,
  sumber,
  search,
  perlu_dicek,
  page = 1,
  limit = 50,
  now = new Date(),
  sortBy = "tanggal_berakhir",
  sortOrder = "desc",
} = {}) {
  const refDate = now instanceof Date ? now : new Date(now);
  const monthStartIso = new Date(refDate.getFullYear(), refDate.getMonth(), 1).toISOString();

  // Ambil data secara paralel dari kedua sumber
  const [appRes, driveRes] = await Promise.all([
    supabaseAdmin
      .from("document_logs")
      .select(
        "id, document_type, document_number, sequence_number, company_code, employee_name, employee_nama_key, google_doc_id, google_doc_url, tanggal_mulai, tanggal_berakhir, jangka_bulan, status_dokumen, lini_bisnis, periode_bulan, created_at, user_email, unfilled_marks"
      )
      .eq("document_type", "pkwt")
      .order("created_at", { ascending: false })
      .limit(5000),
    supabaseAdmin
      .from("pkwt_source")
      .select(
        "id, file_id, nomor_surat, nama_asli, nama_key, kode_perusahaan, bulan_folder, tanggal_mulai, tanggal_berakhir, jangka_bulan, perlu_dicek, alasan_cek, manual_override, drive_modified_time, url, scanned_at"
      )
      .order("id", { ascending: false })
      .limit(5000),
  ]);

  if (appRes.error) {
    console.error("Gagal membaca document_logs:", appRes.error.message);
  }
  if (driveRes.error) {
    console.error("Gagal membaca pkwt_source:", driveRes.error.message);
  }

  const appLogs = appRes.data || [];
  const driveSources = driveRes.data || [];

  // Gabungkan dan hilangkan duplikasi (deduplicate)
  const allContracts = deduplicateContracts(appLogs, driveSources, refDate);

  // Hitung ringkasan statistik (counts) di seluruh himpunan dedup
  const counts = {
    total: allContracts.length,
    aplikasi: 0,
    drive: 0,
    aktif: 0,
    segera: 0,
    expiring30: 0,
    expiring60: 0,
    expiring90: 0,
    kedaluwarsa: 0,
    terbuka: 0,
    perluDicek: 0,
    createdThisMonth: 0,
    draft: 0,
    dikirim: 0,
    ditandatangani: 0,
    arsip: 0,
  };

  for (const c of allContracts) {
    if (c.sumber === "aplikasi") counts.aplikasi += 1;
    if (c.sumber === "drive") counts.drive += 1;

    if (c.perlu_dicek) counts.perluDicek += 1;

    if (c.created_at && c.created_at >= monthStartIso) {
      counts.createdThisMonth += 1;
    }

    if (c.sisa_hari !== null) {
      if (c.sisa_hari >= 0 && c.sisa_hari <= 30) counts.expiring30 += 1;
      if (c.sisa_hari >= 0 && c.sisa_hari <= 60) counts.expiring60 += 1;
      if (c.sisa_hari >= 0 && c.sisa_hari <= 90) counts.expiring90 += 1;
    }

    if (counts[c.state_kontrak] !== undefined) {
      counts[c.state_kontrak] += 1;
    }
    if (counts[c.status_dokumen] !== undefined) {
      counts[c.status_dokumen] += 1;
    }
  }

  // Terapkan filter
  const filtered = filterContracts(allContracts, {
    periode,
    perusahaan,
    status,
    sumber,
    search,
    perlu_dicek,
  });

  // Urutkan (Sorting)
  filtered.sort((a, b) => {
    let valA = a[sortBy];
    let valB = b[sortBy];

    // Penanganan nilai kosong/null
    if (!valA && !valB) return 0;
    if (!valA) return 1;
    if (!valB) return -1;

    let comp = 0;
    if (typeof valA === "string") {
      comp = valA.localeCompare(valB);
    } else if (valA > valB) {
      comp = 1;
    } else if (valA < valB) {
      comp = -1;
    }

    return sortOrder.toLowerCase() === "asc" ? comp : -comp;
  });

  // Paginasi
  const total = filtered.length;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const isAll = limit === 0 || limit === null;
  const limitNum = isAll ? total : Math.max(1, parseInt(limit, 10) || 50);
  const totalPages = isAll ? 1 : Math.ceil(total / limitNum) || 1;
  const offset = (pageNum - 1) * limitNum;
  const data = isAll ? filtered : filtered.slice(offset, offset + limitNum);

  return {
    data,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages,
    counts,
  };
}
