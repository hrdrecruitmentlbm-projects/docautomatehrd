/**
 * Format tanggal relatif: "2 jam lalu", "3 hari lalu".
 *
 * MODUL MURNI — sengaja tidak mengimpor apa pun.
 *
 * Fungsi ini dulunya hidup di lib/sync-status.js, yang juga membuat
 * Supabase client. Karena TopBar adalah Client Component, mengimpor
 * relativeTime dari sana menarik lib/supabase.js beserta seluruh SDK
 * @supabase/supabase-js ke bundle browser — dan dropdown pil status ikut
 * crash saat dibuka. Format tanggal tidak boleh menyeret kode database
 * ke klien.
 *
 * Semua formatter yang dipakai komponen klien harus tinggal di sini.
 */
export function relativeTime(timestamp, now = new Date()) {
  if (!timestamp) return '-';
  const ref = now instanceof Date ? now : new Date(now);
  const diff = ref.getTime() - timestamp;
  if (diff < 0) return 'sebentar lagi';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'baru saja';
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} hari lalu`;
  const months = Math.floor(days / 30);
  return `${months} bulan lalu`;
}
