import { BULAN_ID, addMonths, formatTanggalId } from './pkwt';

/**
 * Masa kontrak & status dokumen.
 *
 * Dipakai bersama oleh halaman Rincian, Register Kontrak, Dashboard, dan
 * ulang-isi dokumen supaya semuanya menghitung "sejak kapan / sampai kapan
 * / masih aktif?" dengan aturan yang sama.
 *
 * Dua konsep DIPISAH dengan sengaja:
 *   - statusDokumen : siklus administratif (draf -> dikirim -> ditandatangani)
 *                     disimpan di kolom status_dokumen.
 *   - stateKontrak   : posisi masa kontrak terhadap hari ini, dihitung dari
 *                     tanggal_berakhir.
 * Keduanya ditampilkan terpisah karena satu karyawan bisa punya kontrak
 * bertanda tangan (ditandatangani) yang sudah kedaluwarsa.
 */

/** Nilai mesin di DB -> label Bahasa Indonesia untuk UI. */
export const DOKUMEN_STATUS = {
  draft: { label: "Draf", className: "bg-slate-100 text-slate-700" },
  dikirim: { label: "Dikirim", className: "bg-blue-100 text-blue-700" },
  ditandatangani: { label: "Ditandatangani", className: "bg-emerald-100 text-emerald-700" },
  arsip: { label: "Arsip", className: "bg-surface-2 text-text-2" },
};

export const DOKUMEN_STATUS_ORDER = ["draft", "dikirim", "ditandatangani", "arsip"];

export const STATE_KONTRAK = {
  belum: {
    label: "Belum ada kontrak",
    short: "Belum ada kontrak",
    className: "bg-red-100 text-red-700",
    dot: "bg-red-600",
  },
  aktif: {
    label: "Aktif",
    short: "Aktif",
    className: "bg-emerald-100 text-emerald-700",
    dot: "bg-emerald-600",
  },
  segera: {
    label: "Segera berakhir",
    short: "≤ 30 hari",
    className: "bg-amber-100 text-amber-700",
    dot: "bg-amber-600",
  },
  kedaluwarsa: {
    label: "Kedaluwarsa",
    short: "Kedaluwarsa",
    className: "bg-red-100 text-red-700",
    dot: "bg-red-600",
  },
  terbuka: {
    label: "Tanpa masa berlaku",
    short: "Tanpa akhir",
    className: "bg-surface-2 text-text-2",
    dot: "bg-slate-500",
  },
};

/** Ambang "segera berakhir" dalam hari. */
export const SEGERA_HARI = 30;

/**
 * Terima Date | number (timestamp) | string.
 *
 * WAJIB: halaman server mengirim `now` sebagai timestamp (`Date.now()` /
 * `Date.getTime()`) karena objek Date tidak selalu praktis melewati batas
 * server/client. Fungsi di bawah ini memanggil now.getFullYear(), jadi
 * kalau diteruskan mentah, hasilnya "b.getFullYear is not a function".
 * Normalisasi di satu tempat membuat semua pemanggil aman — termasuk yang
 * akan datang.
 */
function asDate(value) {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") return new Date(value);
  return new Date();
}

/**
 * Normalisasi berbagai bentuk tanggal menjadi 'YYYY-MM-DD' (ISO) atau null.
 *
 * Sumber datanya beragam dan tidak seragam:
 *   - kolom tanggal_berakhir (sudah ISO, hasil supabase/pkwt-contract.sql)
 *   - form_data yang menyimpan "1 Juni 2027" (formatTanggalId)
 *   - string ISO dari <input type="date">
 *   - objek Date
 *Versi Bahasa Indonesia WAJIB didukung: itulah satu-satunya bentuk yang
 * tersimpan di log lama sebelum kolom tanggal_berakhir ada.
 */
export function toIsoDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return isNaN(value) ? null : toIsoDate(value.toISOString().slice(0, 10));
  }

  const raw = String(value).trim();
  if (!raw) return null;

  // Sudah ISO.
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const d = new Date(`${iso[1]}-${iso[2]}-${iso[3]}T00:00:00Z`);
    return isNaN(d) ? null : `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  // "1 Juni 2027" / "01 Juni 2027" / "1 Juni 2027, 14:32"
  const id = raw.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (id) {
    const monthIndex = BULAN_ID.findIndex(
      (m) => m.toLowerCase() === id[2].toLowerCase()
    );
    if (monthIndex >= 0) {
      return `${id[3]}-${String(monthIndex + 1).padStart(2, "0")}-${id[1].padStart(2, "0")}`;
    }
  }

  // "2027-06" saja (periode, bukan tanggal) -> tidak ada tanggalnya.
  if (/^\d{4}-\d{2}$/.test(raw)) return null;

  // Serial number Sheets/Excel.
  if (/^\d{5}$/.test(raw)) {
    const serial = Number(raw);
    if (serial >= 20000 && serial <= 80000) {
      const d = new Date((serial - 25569) * 86400 * 1000);
      return isNaN(d) ? null : d.toISOString().slice(0, 10);
    }
  }

  const fallback = new Date(raw);
  return isNaN(fallback) ? null : fallback.toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' -> '1 Juni 2027' untuk tampilan. */
export function formatIsoId(iso) {
  if (!iso) return "-";
  return formatTanggalId(iso) || "-";
}

/** Tambah bulan ke tanggal ISO, hasil tetap ISO. */
export function addMonthsIso(iso, months) {
  if (!iso || !months) return null;
  const out = addMonths(new Date(`${toIsoDate(iso) || iso}T00:00:00`), months);
  return isNaN(out) ? null : out.toISOString().slice(0, 10);
}

/**
 * Berapa bulan penuh lagi sebelum kontrak berakhir.
 * Negatif berarti sudah lewat.
 */
export function monthsUntil(iso, now = new Date()) {
  const end = toIsoDate(iso);
  if (!end) return null;
  const ref = asDate(now);
  const endDate = new Date(`${end}T00:00:00`);
  const base = new Date(ref.getFullYear(), ref.getMonth(), 1);
  const endMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  return (endMonth.getFullYear() - base.getFullYear()) * 12 +
    (endMonth.getMonth() - base.getMonth());
}

/** Sisa hari sampai kontrak berakhir (negatif = lewat). */
export function daysUntil(iso, now = new Date()) {
  const end = toIsoDate(iso);
  if (!end) return null;
  const ref = asDate(now);
  const endDate = new Date(`${end}T00:00:00`);
  const today = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  return Math.round((endDate - today) / 86400000);
}

/**
 * Kunci status kontrak — stabil, untuk filter/URL/hitungan.
 * Label Bahasa Indonesia-nya datang dari STATE_KONTRAK lewat contractMeta().
 */
export function stateKeyKaryawan(log, now = new Date()) {
  if (!log) return "belum";
  return stateKeyKontrak(log.tanggal_berakhir, now);
}

export function stateKeyKontrak(tanggalBerakhir, now = new Date()) {
  const iso = toIsoDate(tanggalBerakhir);
  if (!iso) return "terbuka";
  const days = daysUntil(iso, now);
  if (days === null) return "terbuka";
  if (days < 0) return "kedaluwarsa";
  if (days <= SEGERA_HARI) return "segera";
  return "aktif";
}

/** Metadata tampilan untuk sebuah kunci status. */
export function contractMeta(key) {
  return STATE_KONTRAK[key] || STATE_KONTRAK.terbuka;
}

/**
 * Posisi masa kontrak terhadap hari ini, siap tampil.
 * `now` diparameterkan supaya komponen server/client memakai satu
 * referensi yang sama (React compiler purity + hidrasi aman).
 */
export function stateKontrak(tanggalBerakhir, now = new Date()) {
  return contractMeta(stateKeyKontrak(tanggalBerakhir, now));
}

/** Versi meta untuk kontrak yang belum punya baris log sama sekali. */
export function stateKaryawan(log, now = new Date()) {
  if (!log) return STATE_KONTRAK.belum;
  return stateKontrak(log.tanggal_berakhir, now);
}

/**
 * Kolom lifecycle untuk ditulis ke document_logs.
 * Tanggal sudah ternormalisasi jadi ISO supaya bisa di-index.
 */
export function contractColumns({
  tanggalMulai,
  tanggalBerakhir,
  jangkaBulan,
  statusDokumen,
} = {}) {
  const start = toIsoDate(tanggalMulai);
  let end = toIsoDate(tanggalBerakhir);

  // Tanggal berakhir tidak selalu dikirim (mis. hanya jangka waktu).
  if (!end && start && jangkaBulan > 0) {
    end = addMonthsIso(start, jangkaBulan);
  }

  return {
    tanggal_mulai: start,
    tanggal_berakhir: end,
    jangka_bulan: jangkaBulan > 0 ? jangkaBulan : null,
    ...(statusDokumen ? { status_dokumen: statusDokumen } : {}),
  };
}

/**
 * Ambil kontrak terbaru per karyawan dari sekumpulan log.
 * Log harus sudah terurut created_at DESC.
 * Karyawan yang belum punya kontrak tidak muncul di peta — itulah yang
 * Register tandai "Belum ada kontrak".
 */
export function latestContractByEmployee(logs) {
  const map = new Map();
  for (const log of logs || []) {
    const key = log.employee_nama_key;
    if (!key || map.has(key)) continue;
    map.set(key, log);
  }
  return map;
}
