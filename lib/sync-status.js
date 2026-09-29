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
 *
 * PENTING: level 'kosong' HANYA berarti tabelnya benar-benar 0 baris.
 * Query yang GAGAL dilaporkan sebagai 'gagal', bukan 'kosong' — kalau tidak,
 * satu kesalahan jaringan akan tampil sebagai "Data belum ada" padahal
 * ada 112 karyawan. Sama sekali tidak boleh menyatukan master dan payroll
 * jadi satu level "terburuk": keduanya butuh tindakan yang berbeda.
 *
 * HANYA DUA QUERY. Versi sebelumnya menembakkan tiga, dan bersama sebelas
 * query Dashboard menjadi 14 permintaan paralel — melebihi pool PostgREST
 * (10) dengan timeout antrean ~1 detik, sehingga lambda yang baru start
 * bisa dapat 503.
 */

const MASTER_OK_MS = 24 * 60 * 60 * 1000; // > 24 jam = perlu attention
const MASTER_STALE_MS = 7 * 24 * 60 * 60 * 1000; // > 7 hari = basi

function currentPeriod(now) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function masterLevelOf({ count, lastSyncAt }, nowMs) {
  if (count === 0) return 'kosong';
  if (!lastSyncAt) return 'perlu'; // baris ada, tapi kapan sinkron tidak diketahui
  if (nowMs - lastSyncAt > MASTER_STALE_MS) return 'basi';
  if (nowMs - lastSyncAt > MASTER_OK_MS) return 'perlu';
  return 'ok';
}

function payrollLevelOf({ count, period }, expected) {
  if (count === 0) return 'kosong';
  if (period && period < expected) return 'perlu';
  if (!period) return 'perlu';
  return 'ok';
}

export async function getSyncStatus(now = new Date()) {
  const [masterQ, payrollQ] = await Promise.all([
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
  const expected = currentPeriod(now);

  const master = {
    count: masterQ.data?.count || 0,
    lastSyncAt: masterQ.data?.updated_at
      ? new Date(masterQ.data.updated_at).getTime()
      : null,
    error: masterQ.error?.message || null,
  };
  const payroll = {
    count: payrollQ.data?.count || 0,
    lastSyncAt: payrollQ.data?.updated_at
      ? new Date(payrollQ.data.updated_at).getTime()
      : null,
    period: payrollQ.data?.periode_bulan || null,
    error: payrollQ.error?.message || null,
  };

  const masterLevel = master.error ? 'gagal' : masterLevelOf(master, nowMs);
  const payrollLevel = payroll.error ? 'gagal' : payrollLevelOf(payroll, expected);

  // Berapa karyawan yang tidak punya baris payroll sama sekali. Ini
  // prediktor terbaik dari kontrak yang akan keluar dengan gaji kosong.
  // Count-nya sudah dibawa oleh query payroll di atas — tidak perlu
  // query ketiga.
  const missingPayroll = master.error
    ? null
    : Math.max(master.count - payroll.count, 0);

  // Level terburuk HANYA untuk menentukan apakah pil perlu muncul. Isinya
  // tetap per-sumber supaya UI bisa menyebut sumbernya, bukan
  // "Data belum ada" untuk masalah yang sebenarnya soal payroll.
  const rank = { gagal: 0, kosong: 1, basi: 2, perlu: 3, ok: 4 };
  const level =
    [masterLevel, payrollLevel].sort((a, b) => rank[a] - rank[b])[0] || null;

  if (master.error) console.error("Sync status: employees query failed:", master.error);
  if (payroll.error) console.error("Sync status: payroll_latest query failed:", payroll.error);

  return {
    master,
    payroll,
    masterLevel,
    payrollLevel,
    missingPayroll,
    expectedPeriod: expected,
    // null = semua beres. Pil tidak muncul kalau begitu.
    level: level === 'ok' ? null : level,
  };
}
