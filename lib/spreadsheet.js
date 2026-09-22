// Mapping header spreadsheet (fleksibel, tidak tergantung urutan kolom).
// Dipakai oleh /api/import-master dan /api/import-payroll.
import { normalizeName, normalizeLiniBisnis, parseIdAmount } from "@/lib/pkwt";

function headerRowToIndex(headers) {
  const map = new Map();
  headers.forEach((h, i) => {
    const key = String(h || "").toLowerCase().replace(/\s+/g, " ").trim();
    if (key && !map.has(key)) map.set(key, i);
  });
  return map;
}

function findCol(headerMap, aliases) {
  for (const a of aliases) {
    if (headerMap.has(a)) return headerMap.get(a);
  }
  // fallback: contains
  for (const [h, i] of headerMap) {
    if (aliases.some((a) => h.includes(a))) return i;
  }
  return -1;
}

const cell = (row, i) => (i < 0 ? "" : String(row[i] ?? "").trim());

// ---- MASTER ----
const MASTER_ALIAS = {
  nama: ["nama"],
  nik: ["nik"],
  posisi: ["posisi"],
  divisi: ["divisi"],
  liniBisnis: ["lini bisnis"],
  tanggalMasuk: ["tanggal masuk"],
  statusKaryawan: ["status karyawan"],
  keaktifan: ["keaktifan"],
  holding: ["holding"],
  unit: ["unit"],
  alamatTinggal: ["alamat tinggal"],
  alamatKtp: ["alamat ktp"],
  noKtp: ["no ktp"],
  noTelp: ["no telp", "telp"],
  kantor: ["kantor"],
};

export function mapMasterRows(headers, rows) {
  const hm = headerRowToIndex(headers);
  const idx = {
    nama: findCol(hm, MASTER_ALIAS.nama),
    nik: findCol(hm, MASTER_ALIAS.nik),
    posisi: findCol(hm, MASTER_ALIAS.posisi),
    divisi: findCol(hm, MASTER_ALIAS.divisi),
    liniBisnis: findCol(hm, MASTER_ALIAS.liniBisnis),
    tanggalMasuk: findCol(hm, MASTER_ALIAS.tanggalMasuk),
    statusKaryawan: findCol(hm, MASTER_ALIAS.statusKaryawan),
    holding: findCol(hm, MASTER_ALIAS.holding),
    alamatTinggal: findCol(hm, MASTER_ALIAS.alamatTinggal),
    alamatKtp: findCol(hm, MASTER_ALIAS.alamatKtp),
    noKtp: findCol(hm, MASTER_ALIAS.noKtp),
    noTelp: findCol(hm, MASTER_ALIAS.noTelp),
    kantor: findCol(hm, MASTER_ALIAS.kantor),
  };

  // TEMPAT / TANGGAL LAHIR: "BANK DATA KARYAWAN" memakai SATU header gabungan
  // "TEMPAT TANGGAL LAHIR" yang di-merge ke 2 kolom (P = tempat, Q = tanggal).
  // Header gabungan harus ditangani DULU: fallback "contains" biasa akan
  // menunjuk tanggal lahir ke kolom tempat lagi ("Cilacap, Cilacap").
  let tempatIdx = findCol(hm, ["tempat"]);
  let tglLahirIdx = -1;
  const tempatRaw = tempatIdx >= 0 ? String(headers[tempatIdx] || "").toLowerCase() : "";
  if (tempatIdx >= 0 && tempatRaw.includes("tempat") && tempatRaw.includes("tanggal")) {
    // header gabungan: tanggal lahir selalu di kolom sebelahnya
    tglLahirIdx = tempatIdx + 1;
  } else {
    if (tempatIdx < 0) tempatIdx = findCol(hm, ["tempat tanggal lahir"]);
    tglLahirIdx = findCol(hm, ["tanggal lahir"]);
  }

  const employees = [];
  for (const row of rows) {
    const namaAsli = cell(row, idx.nama);
    if (!namaAsli) continue;
    const nama_key = normalizeName(namaAsli);
    if (!nama_key) continue;
    employees.push({
      nama_key,
      nama_asli: namaAsli,
      nik_internal: cell(row, idx.nik),
      posisi: cell(row, idx.posisi),
      divisi: cell(row, idx.divisi),
      lini_bisnis: normalizeLiniBisnis(cell(row, idx.liniBisnis)),
      unit: cell(row, idx.holding) || "",
      tempat_lahir: cell(row, tempatIdx),
      tanggal_lahir: cell(row, tglLahirIdx),
      alamat_tinggal: cell(row, idx.alamatTinggal),
      alamat_ktp: cell(row, idx.alamatKtp),
      no_ktp: cell(row, idx.noKtp),
      no_telp: cell(row, idx.noTelp),
      status_karyawan: cell(row, idx.statusKaryawan),
      tanggal_masuk: cell(row, idx.tanggalMasuk),
    });
  }
  return { employees, colIndex: { ...idx, tempatIdx, tglLahirIdx } };
}

// ---- PAYROLL ----
const PAYROLL_ALIAS = {
  nama: ["nama karyawan", "nama"],
  posisi: ["posisi"],
  divisi: ["divisi"],
  unit: ["unit"],
  gapok: ["gapok", "gaji"],
  uMakan: ["u. makan", "uang makan"],
  uTransport: ["u. transport", "uang transport"],
  penyesuaian: ["penyesuaian uang makan", "penyesuaian"],
  tJabatan: ["t. jabatan", "tunjangan jabatan"],
  tFungsional: ["t. fungsional", "tunjangan fungsional"],
  tKesehatan: ["t. kesehatan", "tunjangan kesehatan"],
  tTransport: ["t. transport"],
  bonusHadir: ["bonus kehadiran", "bonus hadir"],
};

export function mapPayrollRows(headers, rows, periodeBulan) {
  const hm = headerRowToIndex(headers);
  const idx = {
    nama: findCol(hm, PAYROLL_ALIAS.nama),
    posisi: findCol(hm, PAYROLL_ALIAS.posisi),
    divisi: findCol(hm, PAYROLL_ALIAS.divisi),
    unit: findCol(hm, PAYROLL_ALIAS.unit),
    gapok: findCol(hm, PAYROLL_ALIAS.gapok),
    uMakan: findCol(hm, PAYROLL_ALIAS.uMakan),
    uTransport: findCol(hm, PAYROLL_ALIAS.uTransport),
    penyesuaian: findCol(hm, PAYROLL_ALIAS.penyesuaian),
    tJabatan: findCol(hm, PAYROLL_ALIAS.tJabatan),
    tFungsional: findCol(hm, PAYROLL_ALIAS.tFungsional),
    tKesehatan: findCol(hm, PAYROLL_ALIAS.tKesehatan),
    tTransport: findCol(hm, PAYROLL_ALIAS.tTransport),
    bonusHadir: findCol(hm, PAYROLL_ALIAS.bonusHadir),
  };

  const payrolls = [];
  for (const row of rows) {
    const namaAsli = cell(row, idx.nama);
    if (!namaAsli) continue;
    const nama_key = normalizeName(namaAsli);
    if (!nama_key) continue;
    payrolls.push({
      nama_key,
      nama_asli: namaAsli,
      posisi: cell(row, idx.posisi),
      divisi: cell(row, idx.divisi),
      unit: cell(row, idx.unit),
      gapok: parseIdAmount(cell(row, idx.gapok)),
      u_makan: parseIdAmount(cell(row, idx.uMakan)),
      u_transport: parseIdAmount(cell(row, idx.uTransport)),
      penyesuaian: parseIdAmount(cell(row, idx.penyesuaian)),
      t_jabatan: parseIdAmount(cell(row, idx.tJabatan)),
      t_fungsional: parseIdAmount(cell(row, idx.tFungsional)),
      t_kesehatan: parseIdAmount(cell(row, idx.tKesehatan)),
      t_transport: parseIdAmount(cell(row, idx.tTransport)),
      bonus_hadir: parseIdAmount(cell(row, idx.bonusHadir)),
      periode_bulan: periodeBulan,
    });
  }
  return { payrolls };
}
