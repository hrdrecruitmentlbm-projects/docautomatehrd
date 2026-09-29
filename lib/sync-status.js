import { supabaseAdmin } from './supabase';

/**
 * Status kesegaran data master & payroll.
 *
 * Dibaca dari updated_at, bukan dari tabel settings: tabel itu per-pengguna,
 * sedangkan employees/payroll_latest itu GLOBAL. Jadi "sinkron 2 jam lalu"
 * di settings milik satu orang akan berbohong untuk semua orang lain.
 * updated_at di-stempel setiap upsert (lib/sync.js), jadi maxi()-nya
 * adalah waktu data benar-benar berubah.
 *
 * Master dan payroll punya aturan basi yang BERBEDA:
 *   master  — berbasis waktu; sheet berubah kapan saja.
 *   payroll — berbasis periode; 2026-09 di bulan September itu yang benar,
 *              walaupun sync-nya 20 hari lalu. Menandainya "basi" di sini
 *              cuma melatih orang mengabaikan loncengnya.
 */

const MASTER_OK_MS = 24 * 60 * 60 * 1000; // > 24 jam = perlu attention
const MASTER_STALE_MS = 7 * 24 * 60 * 60 * 1000; // > 7 hari = basi

function currentPeriod(now) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export async function getSyncStatus(now = new Date()) {
  const [master, payroll] = await Promise.all([
    supabaseAdmin
      .from('employees')
      .select('nama_key,updated_at', { count: 'exact' })
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('payroll_latest')
      .select('nama_key,updated_at,periode_bulan', { count: 'exact' })
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const nowMs = now.getTime();
  const masterAt = master?.updated_at ? new Date(master.updated_at).getTime() : null;
  const payrollAt = payroll?.updated_at ? new Date(payroll.updated_at).getTime() : null;
  const period = payroll?.periode_bulan || null;
  const expected = currentPeriod(now);

  let masterLevel = 'ok';
  if (!masterAt) masterLevel = 'kosong';
  else if (nowMs - masterAt > MASTER_STALE_MS) masterLevel = 'basi';
  else if (nowMs - masterAt > MASTER_OK_MS) masterLevel = 'perlu';

  let payrollLevel = 'ok';
  if (!period && !payrollAt) payrollLevel = 'kosong';
  else if (period && period < expected) payrollLevel = 'perlu';
  else if (!period) payrollLevel = 'perlu';

  // Berapa karyawan yang tidak punya baris payroll sama sekali. Ini
  // prediktor terbaik dari kontrak yang akan keluar dengan gaji kosong.
  let missingPayroll = 0;
  if (master?.count) {
    const { count } = await supabaseAdmin
      .from('payroll_latest')
      .select('nama_key', { count: 'exact', head: true });
    missingPayroll = Math.max((master.count || 0) - (count || 0), 0);
  }

  const worst = ['kosong', 'basi', 'perlu'].find((l) =>
    masterLevel === l || payrollLevel === l
  );

  return {
    master: { count: master?.count || 0, lastSyncAt: masterAt, level: masterLevel },
    payroll: { count: payroll?.count || 0, lastSyncAt: payrollAt, period, level: payrollLevel },
    missingPayroll,
    expectedPeriod: expected,
    // null = semua beres. Pil tidak muncul kalau begitu.
    level: worst || null,
  };
}

/** "2 jam lalu" / "3 hari lalu" — format relatif yang pendek. */
export function relativeTime(timestamp, now = new Date()) {
  if (!timestamp) return '-';
  const diff = now.getTime() - timestamp;
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
