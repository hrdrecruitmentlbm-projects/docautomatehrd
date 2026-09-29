/**
 * Pembaca body respon yang tahan terhadap respon NON-JSON.
 *
 * `.json()` mentah akan melempar "Unexpected end of JSON input" begitu
 * body-nya kosong — dan itu persis yang terjadi kalau fungsi serverless
 * kena timeout Vercel atau gateway error, karena ia kirim HTML/empty, bukan
 * JSON. Pesan itu di depan pengguna sekarang.
 *
 * Kebenaran penting di balik pesan di bawah: saat timeout, dokumen di Drive
 * SUDAH bisa jadi (copy template + replaceAllText jalan sebelum fungsi
 * mati), padahal row log belum sempat tersimpan. Jadi pengguna yang diarahkan
 * untuk memeriksa Riwayat dulu sebelum mencoba ulang — mencoba ulang
 * sembarangan bisa membuat PKWT kedua dengan nomor kedua.
 */

function describe(res, status) {
  if (status === 504 || status === 524) {
    return 'Server kehabisan waktu (timeout). Dokumen mungkin SUDAH terbuat — ' +
      'periksa halaman Riwayat dulu sebelum mencoba lagi agar tidak ganda.';
  }
  if (status === 502 || status === 503) {
    return 'Server sementara tidak bisa dihubungi. Coba lagi dalam sekejap.';
  }
  if (status === 413) {
    return 'Data yang dikirim terlalu besar.';
  }
  if (status === 0) {
    return 'Koneksi terputus sebelum server merespons. Periksa jaringan Anda.';
  }
  if (res) {
    return `Server merespons dengan status ${status} tanpa data yang bisa dibaca. ` +
      'Periksa Vercel → Logs untuk detailnya.';
  }
  return `Server merespons dengan status ${status}.`;
}

/**
 * Selalu mengembalikan objek. Kalau body tidak bisa dibaca, objeknya berisi
 * { error } sehingga pemanggil lama — `if (!res.ok) throw new Error(data.error)`
 * — tetap berjalan dan menampilkan pesan yang berguna.
 *
 * @param {Response} res
 * @returns {Promise<object>}
 */
export async function readJson(res) {
  const raw = await res.text();

  if (!raw.trim()) {
    return { error: describe(res, res.status) };
  }

  try {
    const json = JSON.parse(raw);
    if (json && typeof json === "object" && !Array.isArray(json)) return json;
    return { error: `Server membalas bukan JSON: ${raw.slice(0, 140)}` };
  } catch {
    // HTML error page (biasanya 5xx dari Vercel) — jangan pernah tampilkan
    // markupnya ke pengguna.
    return { error: describe(res, res.status) };
  }
}
