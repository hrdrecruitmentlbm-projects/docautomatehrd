/**
 * ⚠️ MODUL INI HANYA UNTUK SERVER. JANGAN DI-IMPOR DARI COMPONENT CLIENT.
 *
 * Dua alasan, keduanya sudah kejadian:
 *  1. supabaseAdmin memakai SUPABASE_SERVICE_ROLE_KEY yang bypass RLS dan
 *     memberi akses baca/tulis ke seluruh tabel bersama. Membawanya ke
 *     browser berarti hak akses itu ikut ke sana.
 *  2. createClient() dipanggil saat modul di-load. Kalau modul ini masuk
 *     bundle klien, setiap komponen yang memakainya ikut depend pada SDK
 *     @supabase/supabase-js — dan dropdown pil status sempat crash saat
 *     dibuka hanya karena menarik modul ini, padahal yang dibutuhkannya
 *     cuma pemuat formatter tanggal.
 *
 * Kalau butuh formatter/utility di Client Component, taruh di lib yang
 * murni — contoh: lib/format.js (relativeTime), lib/contract-lifecycle.js.
 * Kalau memang butuh akses Supabase dari klien, JANGAN pakai service role;
 * buat client anon khusus dengan RLS yang benar.
 *
 * Penjaga build-time untuk aturan ini adalah paket `server-only`
 * (`import 'server-only'` di baris pertama). Belum dipasang — lihat
 * catatan di README/commit terkait.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder';

// Anon client. Catatan: saat ini tidak ada komponen klien yang memakainya,
// jadi client ini praktis server-only juga.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side only, requires admin privileges (bypasses RLS).
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Is the server actually pointed at a real project? (Vercel env may be missing)
export function supabaseEnvInfo() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  let host = "";
  try { host = url ? new URL(url).host : ""; } catch { host = "(URL tidak valid)"; }
  return {
    hasUrl: !!url,
    hasServiceKey: !!serviceKey,
    isPlaceholder: !url || /placeholder/i.test(url),
    host,
  };
}

// Unwrap TypeError("fetch failed") cause chains into something human-readable
// (e.g. "fetch failed | getaddrinfo ENOTFOUND placeholder.supabase.co").
export function describeNetError(error) {
  const parts = [];
  let cur = error;
  let depth = 0;
  while (cur && depth < 5) {
    if (cur.message && !parts.includes(cur.message)) parts.push(cur.message);
    if (cur.code && !parts.includes(`code=${cur.code}`)) parts.push(`code=${cur.code}`);
    cur = cur.cause;
    depth++;
  }
  return parts.join(" | ") || String(error);
}

// Supabase errors that are really connectivity/config problems get an
// actionable message instead of a bare "fetch failed".
export function friendlyDbError(error) {
  const msg = error?.message || describeNetError(error);
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|certificate/i.test(msg)) {
    const info = supabaseEnvInfo();
    if (info.isPlaceholder || !info.hasServiceKey) {
      return "Env Vercel belum lengkap: tambahkan NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY di Project Settings > Environment Variables, lalu redeploy.";
    }
    return `Tidak bisa terhubung ke ${info.host}: ${describeNetError(error)}`;
  }
  if (/relation|table|schema/i.test(msg)) {
    return `${msg} — jalankan supabase/pkwt-v2.sql di SQL Editor`;
  }
  return msg;
}
