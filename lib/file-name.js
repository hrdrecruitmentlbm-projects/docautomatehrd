/**
 * Nama berkas hasil generate — MODUL MURNI, sengaja tidak mengimpor apa pun.
 *
 * Format yang dipakai di seluruh aplikasi:
 *
 *   {NOMOR SURAT UTUH}_{NAMA KARYAWAN}
 *   00248/SPK/HRD-NUMETA/INT.5/X/2026_Ayunda Praagustiana
 *
 * Dua keputusan yang terlihat sepele tapi penting:
 *
 * 1. GARIS MIRING DIPERTAHANKAN. Google Drive mengizinkan "/" di nama berkas
 *    (berbeda dengan Windows/POSIX), dan orang mencari kontrak lewat nomor
 *    surat yang sama persis dengan yang tercetak di kertas. Mengganti "/" DULU
 *    dengan "_" membuat nama berkas mustahil dicocokkan dengan nomor surat.
 *    Konsekuensinya: klien sync Drive (Drive for Desktop) mengganti "/" jadi "_"
 *    saat sinkronisasi, dan unduhan PDF harus disanitasi — lihat
 *    app/api/documents/[id]/pdf/route.js.
 *
 * 2. SPASI DI SEKITAR "/" DIHAPUS. generateDocumentNumber() menghasilkan
 *    "00248/ SPK/…" (ada spasi setelah nomor urut) karena spasi itu enak
 *    dibaca di atas kertas. Di nama berkas spasi itu dihapus supaya potongan
 *    nomor tidak terpecah: "00248/SPK/HRD-NUMETA/INT.5/X/2026".
 *
 * Nama kosong TIDAK menghasilkan "_" nyangkung di belakang nomor.
 *
 * Berlaku untuk dokumen BARU saja — berkas lama di Drive tidak diganti nama.
 */
export function buildDocumentFileName(documentNumber, displayName) {
  const number = String(documentNumber || "")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, " ")
    .trim();
  const name = String(displayName || "").trim();

  if (!number) return name;
  if (!name) return number;
  return `${number}_${name}`;
}

/**
 * Varian aman untuk nama berkas DI PERANGKAT (unduhan PDF, ekspor).
 *
 * "/" ilegal di Windows, macOS, dan Android — sistem operasi akan
 * menggantinya sendiri secara tidak dapat diprediksi (atau menolak
 * menyimpan). Kita ganti dulu dengan "-" supaya hasil unduhan identik
 * di semua platform, lalu buang karakter yang dilarang Content-Disposition.
 *
 * Mengembalikan "dokumen" bila semua input kosong, karena nama berkas
 * tidak boleh kosong.
 */
export function buildDownloadFileName(documentNumber, displayName) {
  return (
    buildDocumentFileName(documentNumber, displayName)
      .replace(/\//g, "-")
      .replace(/[^\w\s.-]/g, "")
      .replace(/\s+/g, " ")
      .trim() || "dokumen"
  );
}
