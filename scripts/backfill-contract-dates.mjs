#!/usr/bin/env node
/**
 * Backfill kolom masa kontrak untuk dokumen yang dibuat SEBELUM
 * supabase/pkwt-contract.sql dijalankan.
 *
 * Dipakai sebagai alternatif (atau pengganti) supabase/pkwt-contract-backfill.sql.
 * Morekul: parsing "15 Oktober 2027" memakai parser yang SAMA dengan
 * aplikasi (lib/contract-lifecycle.js -> toIsoDate), jadi tidak ada
 * versi tanggal Indonesia yang ditulis dua kali dan bisa berbeda.
 *
 *   node scripts/backfill-contract-dates.mjs          # dry-run, tidak menulis
 *   node scripts/backfill-contract-dates.mjs --write  # menulis ke database
 *
 * Idempotent: hanya mengisi baris yang kolomnya masih NULL.
 */

import fs from "node:fs";

const WRITE = process.argv.includes("--write");

// ---- Parser: cerminan lib/contract-lifecycle.js (toIsoDate) -------------
const BULAN = {
  januari: 1, februari: 2, maret: 3, april: 4, mei: 5, juni: 6,
  juli: 7, agustus: 8, september: 9, oktober: 10, november: 11, desember: 12,
};

function toIsoDate(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const id = raw.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (id) {
    const m = BULAN[id[2].toLowerCase()];
    if (m) return `${id[3]}-${String(m).padStart(2, "0")}-${id[1].padStart(2, "0")}`;
  }
  return null;
}

function monthsFrom(periode) {
  const m = String(periode || "").match(/^(\d+)/);
  return m ? Number(m[1]) : null;
}

// ---- Env ----------------------------------------------------------------
const env = {};
for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^^["']|["']$/g, "");
}
const URL_BASE = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tidak ada di .env.local");
  process.exit(1);
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
  const res = await rest(
    "document_logs?select=id,sequence_number,document_number,employee_name,tanggal_mulai,tanggal_berakhir,jangka_bulan,form_data&eq(document_type,pkwt)&order=sequence_number.asc"
  );
  if (!res.ok) {
    console.error("Gagal membaca document_logs:", (await res.text()).slice(0, 300));
    process.exit(1);
  }
  const rows = await res.json();

  const plan = rows.map((r) => {
    const fd = r.form_data || {};
    const already = !!(r.tanggal_mulai && r.tanggal_berakhir && r.jangka_bulan);
    return {
      id: r.id,
      seq: r.sequence_number,
      number: r.document_number,
      name: r.employee_name,
      skip: already,
      from: { mulai: fd.tanggal_mulai, berakhir: fd.tanggal_berakhir, bln: fd.periode_kontrak },
      to: {
        tanggal_mulai: toIsoDate(fd.tanggal_mulai),
        tanggal_berakhir: toIsoDate(fd.tanggal_berakhir),
        jangka_bulan: monthsFrom(fd.periode_kontrak),
      },
    };
  });

  const todo = plan.filter((p) => !p.skip);
  // Parsing gagal tidak berarti baris dibuang. Kalau tanggal_mulai bisa
  // dibaca tapi tanggal_berakhir tidak (dokumen lama yang form_data-nya
  // belum punya kunci itu), tetap isi yang bisa — data setengah lebih
  // berguna daripada nol. Tanggal BERAKHIR tidak ditebak: mengarang
  // masa kontrak itu hal yang paling tidak boleh dilakukan di sini.
  const usable = todo.filter((p) => p.to.tanggal_mulai);
  const partial = usable.filter((p) => !p.to.tanggal_berakhir);
  const broken = todo.filter((p) => !p.to.tanggal_mulai);

  console.log(`\nPKWT total              : ${plan.length}`);
  console.log(`Sudah terisi            : ${plan.length - todo.length}`);
  console.log(`Akan diisi penuh        : ${usable.length - partial.length}`);
  console.log(`Akan diisi sebagian     : ${partial.length} (tanggal mulai saja)`);
  console.log(`Tidak bisa diparse      : ${broken.length}\n`);

  console.log("  #   DARI form_data                        -> ISO                JANGKA");
  console.log("  " + "-".repeat(78));
  for (const p of usable) {
    const from = `${p.from.mulai} s/d ${p.from.berakhir ?? "(kosong)"}`.padEnd(36);
    const to = `${p.to.tanggal_mulai} s/d ${p.to.tanggal_berakhir ?? "(tidak diketahui)"}`.padEnd(24);
    console.log(
      `  ${String(p.seq).padStart(3)} ${from} -> ${to} ${p.to.jangka_bulan ?? "?"}`
    );
  }

  if (partial.length) {
    console.log(`\n~ Tanggal berakhir tidak diketahui untuk ${partial.length} dokumen ini:`);
    for (const p of partial) {
      console.log(`   #${p.seq} ${p.number} — mulai ${p.to.tanggal_mulai}, selesai tidak tercatat`);
    }
    console.log("   (dokumen paling lama; Register akan menandai 'Tanpa masa berlaku')");
    console.log("   Isi manual bila perlu lewat SQL:");
    console.log("   update document_logs set tanggal_berakhir = date 'YYYY-MM-DD' where id = '...'");
  }

  if (broken.length) {
    console.log("\n!! Tanggal mulai tidak terbaca — DILEWATI:");
    for (const p of broken) {
      console.log(`   #${p.seq} ${p.number} — "${p.from.mulai}"`);
    }
  }

  if (!WRITE) {
    console.log(`\nDRY-RUN. Tidak ada yang ditulis.`);
    console.log(
      `Jalankan ulang dengan --write untuk mengisi ${usable.length} baris.`
    );
    return;
  }

  if (!usable.length) {
    console.log("\nTidak ada yang bisa diisi. Selesai.");
    return;
  }

  console.log(`\nMengupdate ${usable.length} baris...`);
  let ok = 0;
  const failures = [];
  for (const p of usable) {
    const patch = {};
    if (!p.skip) patch.tanggal_mulai = p.to.tanggal_mulai;
    if (p.to.tanggal_berakhir) patch.tanggal_berakhir = p.to.tanggal_berakhir;
    if (p.to.jangka_bulan) patch.jangka_bulan = p.to.jangka_bulan;
    if (!Object.keys(patch).length) continue;

    const r = await rest(`document_logs?id=eq.${p.id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    if (r.ok) ok += 1;
    else failures.push(`#${p.seq}: ${(await r.text()).slice(0, 160)}`);
  }

  console.log(`Berhasil : ${ok}`);
  console.log(`Gagal    : ${failures.length}`);
  for (const f of failures) console.log("   " + f);
})();
