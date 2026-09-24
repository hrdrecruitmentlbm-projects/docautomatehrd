// PKWT v2 helpers — single-purpose module for employee/payroll automation.
//
// Konvensi:
// - Join master <-> payroll memakai nama ternormalisasi (payroll tidak punya NIK).
// - Driver perusahaan/KOP adalah kolom LINI BISNIS (bukan HOLDING).
// - SAHAM / TALOG / TAST belum punya KOP -> fallback template generik.

export const LINI_BISNIS_MAP = {
  LBM: "LBM",
  MJO: "MJO",
  NUMETA: "NUMETA",
  MARKETPLACE: "NUMETA",
  TUNET: "TUNET",
  WMS: "TUNET",
  MSH: "MSH",
  UBR: "MSH",
  LKM: "LKM",
  DGL: "DGL",
  // Tanpa KOP (fallback generik, dokumen tetap dibuat + diedit manual):
  SAHAM: null,
  TALOG: null,
  TAST: null,
};

export const NO_KOP_SET = new Set(["SAHAM", "TALOG", "TAST"]);

export function normalizeName(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeLiniBisnis(value) {
  return String(value || "").toUpperCase().replace(/\s+/g, " ").trim();
}

export function resolveCompany(liniBisnis) {
  const key = normalizeLiniBisnis(liniBisnis);
  if (!key) return { key: "", companyCode: "UMUM", hasKop: false };
  if (key in LINI_BISNIS_MAP) {
    const code = LINI_BISNIS_MAP[key];
    return { key, companyCode: code || "UMUM", hasKop: !!code };
  }
  return { key, companyCode: "UMUM", hasKop: false };
}

// Parse angka format Indonesia: "1.924.000", "-26.000", "", "-", 20000 -> number
export function parseIdAmount(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  const s = String(value).trim();
  if (!s || s === "-" || s === "–") return 0;
  const neg = s.startsWith("-") || s.startsWith("(");
  const digits = s.replace(/[^0-9]/g, "");
  if (!digits) return 0;
  const n = parseInt(digits, 10);
  return neg ? -n : n;
}

export function formatRp(n) {
  const v = typeof n === "number" ? n : parseIdAmount(n);
  const sign = v < 0 ? "-" : "";
  const abs = Math.abs(Math.round(v));
  const grouped = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `Rp ${sign}${grouped},-`;
}

const BULAN_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function formatTanggalId(input) {
  if (!input) return "";
  if (input instanceof Date && !isNaN(input)) {
    return `${input.getDate()} ${BULAN_ID[input.getMonth()]} ${input.getFullYear()}`;
  }
  const s = String(input).trim();
  if (!s) return "";
  // Sudah format Indonesia ("23 Juli 1989", "14 Maret 2020") -> pakai apa adanya
  if (/[A-Za-z]{3,}/.test(s) && /\d{4}/.test(s)) return s;
  // ISO / YYYY-MM-DD
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const y = parseInt(iso[1], 10);
    const m = parseInt(iso[2], 10);
    const d = parseInt(iso[3], 10);
    if (m >= 1 && m <= 12) return `${d} ${BULAN_ID[m - 1]} ${y}`;
  }
  // Serial Google Sheets/Excel (hari sejak 1899-12-30), mis. "45418".
  // Tanpa ini new Date("45418") dibaca sebagai TAHUN 45418.
  if (/^\d{4,6}$/.test(s)) {
    const serial = parseInt(s, 10);
    if (serial > 20000 && serial < 80000) {
      const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
      return `${d.getUTCDate()} ${BULAN_ID[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
    }
  }
  const d = new Date(s);
  if (!isNaN(d)) return `${d.getDate()} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
  return s;
}

// Label folder arsip bulanan, cth: "September 2026".
// Dipakai penamaan folder HRIS PKWT/<Bulan Tahun>/<KODE>.
export function formatMonthYearId(input) {
  const d = input instanceof Date ? new Date(input) : new Date(input);
  if (isNaN(d)) return "";
  return `${BULAN_ID[d.getMonth()]} ${d.getFullYear()}`;
}

export function combineTtl(tempat, tanggal) {
  const t = String(tempat || "").trim();
  const formatted = formatTanggalId(tanggal);
  if (t && formatted) return `${t}, ${formatted}`;
  return t || formatted;
}

// ALAMAT KTP "IDEM"/"-"/kosong -> pakai alamat tinggal
export function resolveAlamat(alamatTinggal, alamatKtp) {
  const tinggal = String(alamatTinggal || "").trim();
  const ktp = String(alamatKtp || "").trim();
  if (!ktp || /^idem$/i.test(ktp) || ktp === "-") return tinggal;
  return ktp;
}

export function addMonths(dateInput, months) {
  const d = dateInput instanceof Date ? new Date(dateInput) : new Date(dateInput);
  d.setMonth(d.getMonth() + months);
  return d;
}

// Nomor urut global sudah dibuat server-side; ini hanya untuk preview.
// Format: {SEQ}/ {CODE}/HRD-{COMPANY}/INT.{day}/{ROMAN}/{year}
export function previewDocumentNumber(seq, docCode, companyCode, date = new Date()) {
  const ROMAN = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII"];
  const sequence = String(seq).padStart(4, "0");
  return `${sequence}/ ${docCode}/HRD-${companyCode}/INT.${date.getDate()}/${ROMAN[date.getMonth()]}/${date.getFullYear()}`;
}

// Bangun replacements untuk Docs replaceAllText (matchCase: true).
// Mencakup key snake_case BARU + key LEGACY campuran di 6 template lama
// agar tidak ada {{...}} tersisa apa pun ejaan template-nya.
export function buildPkwtReplacements({ employee = {}, payroll = {}, manual = {}, documentNumber = "", companyLegal = "" }) {
  const nama = employee.nama_asli || employee.nama || "";
  const ttl = combineTtl(employee.tempat_lahir, employee.tanggal_lahir);
  const alamatTinggal = String(employee.alamat_tinggal || "").trim();
  const alamatKtp = resolveAlamat(alamatTinggal, employee.alamat_ktp);
  const noKtp = employee.no_ktp || "";
  const posisi = employee.posisi || "";
  const divisi = employee.divisi || "";
  const liniBisnis = employee.lini_bisnis || "";
  const perusahaan = companyLegal || liniBisnis;

  const tanggalMulai = formatTanggalId(manual.tanggal_mulai);
  const tanggalBerakhir = formatTanggalId(manual.tanggal_berakhir);
  const tanggalTtd = formatTanggalId(manual.tanggal_ttd || new Date());
  const periode = manual.periode_kontrak || "";

  // Template sudah menulis "Rp." di depan tiap baris — kirim angka polos
  // agar tidak jadi "Rp. Rp 1.114.000,-". UI preview tetap pakai formatRp.
  const bareRp = (v) => formatRp(v).replace(/^Rp\s*/i, "");
  const gapok = bareRp(payroll.gapok);
  const uangMakan = bareRp(payroll.u_makan);
  const uangTransport = bareRp(payroll.u_transport);
  const penyesuaian = bareRp(payroll.penyesuaian);
  const tJabatan = bareRp(payroll.t_jabatan);
  const tFungsional = bareRp(payroll.t_fungsional);
  const tKesehatan = bareRp(payroll.t_kesehatan);
  const tTransport = bareRp(payroll.t_transport);

  const nomor = documentNumber;

  return {
    // ---- key BARU (snake_case) ----
    nama, tempat_tanggal_lahir: ttl, alamat_tinggal: alamatTinggal, alamat_ktp: alamatKtp,
    no_ktp: noKtp, posisi, divisi, lini_bisnis: liniBisnis, perusahaan,
    periode_kontrak: periode, tanggal_mulai: tanggalMulai, tanggal_berakhir: tanggalBerakhir,
    tanggal_ttd: tanggalTtd, tanggal: tanggalTtd,
    gapok, uang_makan: uangMakan, uang_transport: uangTransport, penyesuaian,
    t_jabatan: tJabatan, t_fungsional: tFungsional, t_kesehatan: tKesehatan, t_transport: tTransport,
    nomor_surat: nomor, nomor: nomor,
    // {{kop}} TIDAK diganti di sini: penanda itu dipakai insertKopImage()
    // (lib/google.js) untuk menaruh gambar KOP di posisinya, lalu dihapus.

    // ---- key LEGACY (template lama, case sensitif) ----
    NAMA: nama,
    "TEMPAT TANGGAL LAHIR": ttl,
    "ALAMAT TINGGAL": alamatTinggal,
    "NO KTP": noKtp,
    POSISI: posisi,
    DIVISI: divisi,
    "LINI BISNIS": liniBisnis,
    "perusahaan lini bisnis": perusahaan,
    "periode kontrak": periode,
    "TANGGAL HABIS KONTRAK": tanggalBerakhir,
    "kontrak berakhir": tanggalBerakhir,
    GapokS: gapok,
    "Uang Makan": uangMakan,
    "Uang Transport": uangTransport,
    "T. Fungsional": tFungsional,
    "T. Kesehatan": tKesehatan,
    "T. Jabatan": tJabatan,
    "T. Transport": tTransport,
    // Ejaan lain yang dipakai template: koma, tanpa titik.
    "T, Fungsional": tFungsional,
    "T, Kesehatan": tKesehatan,
    "T, Jabatan": tJabatan,
    "T, Transport": tTransport,
    "T Fungsional": tFungsional,
    "T Kesehatan": tKesehatan,
    "T Jabatan": tJabatan,
    "T Transport": tTransport,
    "Penyesuaian Uang makan & Transport": penyesuaian,
    tanggal: tanggalTtd,
  };
}
