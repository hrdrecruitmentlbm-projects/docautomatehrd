import { combineTtl, formatTanggalId } from "./pkwt";

// Penanda tanda tangan. Tidak boleh di-hardcode di lib/google.js karena
// engine image-generic menerimanya sebagai parameter — tiap jenis dokumen
// supply penandanya sendiri.
export const TTD_MARKS = ["{{ttd}}", "{{TTD}}", "{{Ttd}}"];

// Prefix aset di Drive. Mengikuti konvensi KOP ("KOP <CODE>.png") supaya
// searchable dan tidak perlu konfigurasi baru: TTD LBM.png, TTD MJO.png, ...
export const TTD_ASSET_PREFIX = "TTD";

/**
 * Isian untuk 11 penanda data di template Paklaring (Surat Keterangan Kerja).
 *
 * TIDAK ada penanda gaji di dokumen ini, jadi fungsi ini tidak menerima
 * payroll sama sekali. Itu bukan kekurangan: surat keterangan kerja tidak
 * memuat komponen gaji, dan menarik payroll hanya menambah satu query yang
 * bisa gagal tanpa alasan.
 *
 * PENTING — replacePlaceholders() memakai matchCase: true. Ejaan huruf besar
 * dan kecil adalah penanda BERBEDA:
 *   {{LINI BISNIS}}  -> kode internal ("MJO"), dipakai di baris jabatan
 *   {{lini bisnis}}  -> kode internal juga, dipakai di "Adalah benar karyawan di"
 *   {{perusahaan lini bisnis}} -> nama PT legal, dipakai di blok tanda tangan
 * Ketiganya sengaja berbeda. Jangan "menyeragamkan" ejaannya tanpa mengganti
 * isi di template, karena verifyDocument() hanya melihat nama penandanya.
 */
export function buildPaklaringReplacements({
  employee = {},
  manual = {},
  documentNumber = "",
  companyLegal = "",
} = {}) {
  const emp = employee || {};
  const m = manual || {};

  const nama = emp.nama_asli || emp.nama || "";
  const ttl = combineTtl(emp.tempat_lahir, emp.tanggal_lahir);
  const alamat = String(emp.alamat_tinggal || "").trim();
  const posisi = emp.posisi || "";
  const divisi = emp.divisi || "";
  const liniBisnis = emp.lini_bisnis || "";
  const perusahaan = companyLegal || liniBisnis;

  // "telah bekerja dari tanggal {{TANGGAL MASUK}} sampai {{today}}".
  // Satu tanggal dipakai di dua tempat (badan surat + PURWOKERTO), jadi
  // keduanya HARUS berasal dari field yang sama. Generator memaksa
  // tanggal_keluar selalu terisi; lihat generate-paklaring.js.
  const tanggalMasuk = formatTanggalId(emp.tanggal_masuk);
  const hariKerja = formatTanggalId(m.tanggal_keluar);

  const nomor = documentNumber || "";

  return {
    // --- Nomor surat ---
    nomor_surat: nomor,
    // Alias yang sering ikut saat menyalin penanda dari template PKWT.
    nomor,

    // --- Identitas karyawan (sudah cocok dengan key legacy PKWT) ---
    NAMA: nama,
    nama,
    "TEMPAT TANGGAL LAHIR": ttl,
    "ALAMAT TINGGAL": alamat,

    // --- Periode bekerja ---
    "TANGGAL MASUK": tanggalMasuk,
    tanggal_masuk: tanggalMasuk,
    today: hariKerja,
    // Alias: template lain di repo ini memakai "tanggal" untuk hari yang sama.
    tanggal: hariKerja,

    // --- Jabatan: template memakai huruf KAPITAL, key PKWT huruf kecil.
    // matchCase: true -> keduanya wajib ada. ---
    POSISI: posisi,
    posisi,
    DIVISI: divisi,
    divisi,
    "LINI BISNIS": liniBisnis,
    "lini bisnis": liniBisnis,
    lini_bisnis: liniBisnis,

    // --- Perusahaan: nama PT legal, hanya untuk blok tanda tangan ---
    "perusahaan lini bisnis": perusahaan,

    // {{kop}} dan {{ttd}} SENGAJA tidak ada di sini: keduanya adalah penanda
    // gambar, bukan teks. Ditangani oleh insertKopImage()/insertSignatureImage()
    // yang menghapus penandanya lalu menyisipkan gambar. Kalau penanda gambar
    // ikut di map ini, verifyDocument() akan melaporkannya sebagai "belum
    // terisi" padahal penandanya memang sudah hilang.
  };
}

/**
 * Penanda yang JIKA dikosongkan membuat kalimatnya tidak lengkap.
 *
 verifyDocument() menangkap penanda yang TERTINGGAL (matchCase: true gagal,
 atau ejaan penanda salah). Ia TIDAK menangkap nilai yang terkirim kosong —
 penandanya hilang bersih, dokumen terlihat rapi, tapi kalimatnya berbunyi
 "telah bekerja dari tanggal  sampai 30 September 2026".
 *
 * Fungsi ini menutup celah itu. Hasilnya dilaporkan di UI tanpa membatalkan
 * dokumen, sama seperti penanda tertinggal.
 *
 @param {object} employee baris employees
 * @returns {string[]} nama field yang kosong
 */
export function paklaringBlankFields(employee = {}) {
  const emp = employee || {};
  const checks = [
    ["nama", emp.nama_asli || emp.nama],
    ["tempat/tanggal lahir", emp.tempat_lahir],
    ["tanggal lahir", emp.tanggal_lahir],
    ["alamat", emp.alamat_tinggal],
    ["tanggal masuk", emp.tanggal_masuk],
    ["posisi", emp.posisi],
  ];
  return checks
    .filter(([, v]) => !String(v || "").trim())
    .map(([name]) => name);
}
