#!/usr/bin/env node
/**
 * Backfill kolom perpanjangan_dari untuk dokumen PKWT lama berdasarkan aturan tanggal:
 * Kontrak baru dengan tanggal_mulai >= tanggal_berakhir kontrak sebelumnya untuk karyawan yang sama
 * ditandai sebagai perpanjangan dari id kontrak sebelumnya.
 *
 *   node scripts/backfill-perpanjangan.mjs          # dry-run, hanya melihat rencana
 *   node scripts/backfill-perpanjangan.mjs --dry-run # eksplisit dry-run
 *   node scripts/backfill-perpanjangan.mjs --write   # menulis ke database Supabase
 *
 * Idempotent: aman dijalankan berulang kali.
 */

import fs from "node:fs";

const WRITE = process.argv.includes("--write");
const DRY_RUN = process.argv.includes("--dry-run") || !WRITE;

// Helper normalisasi nama karyawan
function normalizeKey(str) {
  if (!str) return "";
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Baca konfigurasi environment (.env.local atau environment process)
const env = { ...process.env };
if (fs.existsSync(".env.local")) {
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL_BASE || !KEY) {
  console.log("=== BACKFILL PERPANJANGAN DARI (PKWT) ===");
  console.log("Info: NEXT_PUBLIC_SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum terkonfigurasi di environment / .env.local.");
  console.log("Script backfill siap digunakan saat kredensial Supabase tersedia di lingkungan produksi.");
  process.exit(0);
}

const HEADERS = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

const rest = (path, init = {}) =>
  fetch(`${URL_BASE}/rest/v1/${path}`, { headers: HEADERS, ...init });

(async () => {
  console.log("=== BACKFILL PERPANJANGAN DARI (PKWT) ===");
  console.log(`Mode: ${DRY_RUN ? "DRY-RUN (tidak menulis ke DB)" : "WRITE (menulis ke DB)"}\n`);

  const res = await rest(
    "document_logs?select=id,document_number,sequence_number,employee_name,employee_nama_key,tanggal_mulai,tanggal_berakhir,perpanjangan_dari,created_at&eq(document_type,pkwt)&order=created_at.asc"
  );

  if (!res.ok) {
    console.error("Gagal membaca document_logs:", (await res.text()).slice(0, 300));
    process.exit(1);
  }

  const rows = await res.json();
  console.log(`Ditemukan ${rows.length} total baris dokumen PKWT.`);

  // Kelompokkan per karyawan
  const byEmployee = new Map();
  for (const r of rows) {
    const key = r.employee_nama_key || normalizeKey(r.employee_name);
    if (!key) continue;
    if (!byEmployee.has(key)) {
      byEmployee.set(key, []);
    }
    byEmployee.get(key).push(r);
  }

  const updates = [];
  let alreadySetCount = 0;

  for (const [key, empDocs] of byEmployee.entries()) {
    if (empDocs.length < 2) continue;

    // Urutkan kronologis tanggal mulai & created_at
    empDocs.sort((a, b) => {
      const startA = a.tanggal_mulai || "";
      const startB = b.tanggal_mulai || "";
      if (startA !== startB) return startA.localeCompare(startB);
      return (a.created_at || "").localeCompare(b.created_at || "");
    });

    for (let i = 1; i < empDocs.length; i++) {
      const prior = empDocs[i - 1];
      const cur = empDocs[i];

      const priorEnd = prior.tanggal_berakhir;
      const curStart = cur.tanggal_mulai;

      // Aturan perpanjangan: tanggal_mulai baru >= tanggal_berakhir lama
      if (curStart && priorEnd && curStart >= priorEnd) {
        if (cur.perpanjangan_dari === prior.id) {
          alreadySetCount++;
        } else {
          updates.push({
            id: cur.id,
            document_number: cur.document_number,
            employee_name: cur.employee_name,
            curStart,
            priorEnd,
            priorId: prior.id,
            priorNumber: prior.document_number,
            currentPerpanjanganDari: cur.perpanjangan_dari,
          });
        }
      }
    }
  }

  console.log(`Dokumen yang sudah benar sebelumnya: ${alreadySetCount}`);
  console.log(`Dokumen yang perlu diperbarui: ${updates.length}\n`);

  if (updates.length === 0) {
    console.log("Semua data perpanjangan sudah konsisten dan mutakhir. Selesai!");
    process.exit(0);
  }

  for (const u of updates) {
    console.log(
      `• [${u.employee_name}] ${u.document_number} (Mulai: ${u.curStart}) => perpanjangan_dari: ${u.priorNumber} (${u.priorId})`
    );
  }

  if (DRY_RUN) {
    console.log(`\n[DRY RUN SELESAI] Tidak ada data yang diubah.`);
    console.log(`Jalankan: 'node scripts/backfill-perpanjangan.mjs --write' untuk mengeksekusi update.`);
    process.exit(0);
  }

  console.log(`\nMengeksekusi ${updates.length} pembaruan ke database...`);
  let successCount = 0;
  let failCount = 0;

  for (const u of updates) {
    const patchRes = await rest(`document_logs?id=eq.${u.id}`, {
      method: "PATCH",
      body: JSON.stringify({ perpanjangan_dari: u.priorId }),
    });

    if (patchRes.ok) {
      successCount++;
    } else {
      failCount++;
      console.error(`Gagal update dokumen ${u.id}:`, (await patchRes.text()).slice(0, 150));
    }
  }

  console.log(`\nSelesai! Berhasil: ${successCount}, Gagal: ${failCount}`);
})();
