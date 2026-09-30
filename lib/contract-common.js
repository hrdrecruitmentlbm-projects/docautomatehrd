import { supabaseAdmin } from "./supabase";
import { getOrCreateFolder } from "./drive-folders";
import { resolveCompany, normalizeLiniBisnis } from "./pkwt";
import { verifyDocument } from "./template-scan";

/**
 * Potongan yang PERSIS sama antara PKWT dan Paklaring.
 *
 * Kenapa diekstrak, dan kenapa generate-pkwt.js TIDAK ditulis ulang:
 * engine PKWT sudah dipakai di produksi dan menghasilkan dokumen hukum. Menyalin
 * logikanya ke lib/generate-paklaring.js berarti dua salinan yang bisa
 * melenceng diam-diam — dan yang melenceng itu kontrak, bukan kode.
 * Jadi PKWT memanggil helper ini, dan perilakunya tidak berubah.
 *
 * Yang TIDAK ikut diekstrak: query payroll, guard 422 payroll kosong, dan
 * hitung jangka waktu. Itu benar-benar spesifik PKWT, dan Paklaring tidak
 * punya padanannya.
 */

/**
 * Rantai resolusi template + folder untuk satu jenis dokumen.
 *
 * @param {object} args
 * @param {object} args.employee    baris employees
 * @param {object} args.settings    baris settings pengguna (boleh null)
 * @param {string[]} args.templateColumns nama kolom template, urut prioritas
 * @param {string[]} args.folderColumns   nama kolom folder, urut prioritas
 * @returns {Promise<{liniBisnis, mapping, companyCode, numberingCode, hasKop,
 *   legalName, templateId, folderId}>}
 */
export async function resolveCompanyConfig({
  employee,
  settings = {},
  templateColumns = [],
  folderColumns = [],
} = {}) {
  const liniBisnis = employee?.lini_bisnis || "";

  const { data: mapping } = await supabaseAdmin
    .from("company_map")
    .select("*")
    .eq("lini_bisnis", normalizeLiniBisnis(liniBisnis))
    .single();
  const { data: fallbackMap } = await supabaseAdmin
    .from("company_map")
    .select("*")
    .eq("lini_bisnis", "__FALLBACK__")
    .single();

  const resolved = resolveCompany(liniBisnis);
  const mappedCode = mapping?.company_code || null;
  const hasKop = !!mappedCode || resolved.hasKop;
  const companyCode = mappedCode || resolved.companyCode;
  // Penomoran: kode KOP bila ada, sonst nama lini bisnis mentah (cth: HRD-SAHAM).
  const numberingCode = hasKop ? companyCode : liniBisnis || "UMUM";

  // Template berkop memakai kop perusahaan, jadi hanya boleh dipakai untuk
  // lini bisnis yang punya kop. Tanpa kop -> harus jatuh ke template generik.
  // Inilah alasan `mapping` dilewati sepenuhnya, bukan hanya kolomnya.
  const sources = hasKop ? [mapping, fallbackMap, settings] : [fallbackMap, settings];

  const pick = (columns) => {
    for (const source of sources) {
      for (const col of columns) {
        const value = source?.[col];
        if (value) return String(value).trim();
      }
    }
    return null;
  };

  return {
    liniBisnis,
    mapping: mapping || null,
    companyCode,
    numberingCode,
    hasKop,
    legalName: mapping?.legal_name || companyCode,
    templateId: pick(templateColumns),
    folderId: pick(folderColumns),
  };
}

/**
 * Buat (atau pakai) folder arsip bertingkat di bawah root.
 *
 * Segmen PKWT   : ["September 2026", "MJO"]  -> HRIS PKWT/September 2026/MJO
 * Segmen Paklaring: ["Paklaring", "September 2026"] -> HRIS PKWT/Paklaring/September 2026
 *
 * Gagal membuat folder TIDAK membatalkan dokumen: pemanggil memakai
 * folderId yang dikembalikan di sini (root) dan menempelkan catatan di respons
 * supaya pengguna tahu dokumennya berakhir di tempat lain. Folder yang hilang
 * jauh lebih murah diperbaiki daripada kontrak yang hilang.
 *
 * @param {object} args
 * @param {string} args.accessToken
 * @param {string} args.rootFolderId
 * @param {string[]} args.segments nama folder, dari atas ke bawah
 * @param {Map} [args.memo] cache per-request (wajib saat batch)
 * @returns {Promise<{folderId, path, note, error}>}
 */
export async function resolveArchiveFolder({ accessToken, rootFolderId, segments, memo }) {
  if (!rootFolderId) {
    return { folderId: null, path: null, note: "", error: "Folder root belum dikonfigurasi." };
  }

  const wanted = (segments || []).filter(Boolean);
  if (wanted.length === 0) {
    return { folderId: rootFolderId, path: null, note: "", error: null };
  }

  try {
    const cache = memo || new Map();
    let current = rootFolderId;
    for (const name of wanted) {
      current = await getOrCreateFolder(accessToken, current, name, cache);
    }
    return { folderId: current, path: wanted.join("/"), note: "", error: null };
  } catch (e) {
    console.error("resolveArchiveFolder failed, falling back to root:", e);
    return {
      folderId: rootFolderId,
      path: null,
      note: `Folder arsip gagal dibuat (${e.message}) — dokumen disimpan di folder root.`,
      error: e.message,
    };
  }
}

/**
 * Tutup pembuatan dokumen: periksa penanda, lalu catat ke document_logs.
 *
 * Dua lapis, dan KEDUA-duanya tidak boleh menggagalkan pembuatan:
 *   - verifyDocument() melaporkan penanda {{…}} yang masih tertinggal, yaitu
 *     kontrak hukum yang keluar dengan {{t_kesehatan}} tercetak di dalamnya.
 *   - Insert log yang gagal = dokumen ada di Drive tapi tidak terlihat di app.
 *     Itu dilaporkan lewat logError di respons, bukan lewat exception.
 *
 * Insert dicoba dua kali: sekali dengan kolom lifecycle/arsip, sekali lagi
 * tanpa kolom itu bila Supabase bilang "column does not exist" — supaya
 * supabase/paklaring.sql belum dijalankan tidak membuat Paklaring mati total.
 *
 * @param {string} args.docType jenis dokumen — WAJIB diteruskan ke
 *   verifyDocument(). Tanpa ini pemeriksa memakai key PKWT dan melaporkan
 *   SEMUA penanda Paklaring sebagai belum terisi, persis kesalahan yang
 *   funcinya sendiri untuk mencegahnya.
 * @returns {Promise<{unfilled, verifyError, logError, persisted}>}
 */
export async function finalizeDocument({
  accessToken,
  docId,
  docType,
  baseRow,
  optionalColumns = {},
} = {}) {
  const verify = await verifyDocument(accessToken, docId, docType);

  // Hanya tulis kolom audit bila pemeriksa menemukan sisa penanda; kalau
  // tidak, biarkan NULL agar distinguish "bersih" dari "tidak diperiksa".
  const optional = { ...optionalColumns };
  if (verify.unfilled.length) {
    optional.unfilled_marks = verify.unfilled;
    optional.verified_at = new Date().toISOString();
  }

  const full = { ...baseRow, ...optional };
  const { error } = await supabaseAdmin.from("document_logs").insert(full);

  // Skema lama belum punya kolom lifecycle -> ulangi tanpa kolom itu.
  if (error && /column|does not exist/i.test(error.message || "")) {
    const { error: retryError } = await supabaseAdmin.from("document_logs").insert(baseRow);
    return {
      unfilled: verify.unfilled,
      verifyError: verify.error || null,
      logError: retryError ? retryError.message : null,
      persisted: false,
    };
  }

  return {
    unfilled: verify.unfilled,
    verifyError: verify.error || null,
    logError: error ? error.message : null,
    persisted: true,
  };
}
