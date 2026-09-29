import { google } from 'googleapis';
import { getGoogleClient, collectSegments, fullText } from './google';
import { buildPkwtReplacements } from './pkwt';

/**
 * Pemeriksaan penanda template ({{…}}).
 *
 * Dua mode dari satu mesin yang sama:
 *   auditTemplate()  — SEBELUM membuat. Menandai penanda di template yang
 *                      tidak bisa diisi aplikasi. Penanda seperti
 *                      {{T, Fungsional}} akan terkirim apa adanya ke setiap
 *                      kontrak untuk perusahaan itu, dan tidak ada yang
 *                      sadar sampai dokumen dibuka.
 *   verifyDocument() — SETELAH membuat. Menacey penanda yang masih tertinggal
 *                      di dokumen hasil. Ini yang menutup lingkaran.
 *
 * Kunci yang bisa diisi diambil dari buildPkwtReplacements() secara langsung,
 * jadi daftar ini tidak pernah bisa lengang dari engine pengisi.
 */

/** Cocokkan {{nama}} dan {{T, Fungsional}}; [^{}]+ menolak "{{}}" ganda. */
const MARK_RE = /\{\{([^{}]+)\}\}/g;

/** Penanda KOP dihapus sendiri setelah gambar masuk, jadi tidak dilaporkan. */
const KOP_MARK_RE = /^\s*kop\s*$/i;

/**
 * Semua penanda yang bisa diisi engine, apa adanya.
 * buildPkwtReplacements menerima objek kosong; yang dibutuhkan hanya
 * Object.keys()-nya, jadi nilai isiannya tidak pernah dipakai.
 */
export function knownMarkKeys() {
  return Object.keys(buildPkwtReplacements({}));
}

/**
 * Kumpulkan penanda dari satu segmen.
 * Whitespace di tepi dibuang, spasi di TENGAH dijaga: "T, Fungsional" dan
 * "T Fungsional" memang penanda berbeda dan harus tetap dibedakan.
 */
function marksInText(text) {
  const found = new Map();
  for (const m of String(text || "").matchAll(MARK_RE)) {
    const key = m[1].trim();
    if (!key) continue;
    found.set(key, (found.get(key) || 0) + 1);
  }
  return found;
}

/** Ambil dokumen Google Docs lengkap dengan isi semua tab/header/footer. */
async function fetchDoc(accessToken, docId) {
  const docs = google.docs({ version: 'v1', auth: getGoogleClient(accessToken) });
  // Sengaja TANPA fields mask: mask yang membatasi terbukti stripping
  // startIndex/endIndex dari elemen header (lihat insertKopImage).
  return (await docs.documents.get({ documentId: docId, includeTabsContent: true })).data;
}

/**
 * Kumpulkan seluruh penanda dari sebuah dokumen.
 * @returns {Map<string, {count: number, segments: string[]}>}
 */
async function collectMarks(accessToken, docId) {
  const doc = await fetchDoc(accessToken, docId);
  const all = new Map();

  for (const seg of collectSegments(doc)) {
    for (const [key, count] of marksInText(fullText(seg.content))) {
      if (!all.has(key)) all.set(key, { count: 0, segments: [] });
      const entry = all.get(key);
      entry.count += count;
      if (!entry.segments.includes(seg.label)) entry.segments.push(seg.label);
    }
  }
  return all;
}

/**
 * Pemeriksaan template (sebelum membuat).
 *
 * @returns {{
 *   ok: boolean,
 *   total: number,
 *   terisi: string[],
 *   tidakDikenal: Array<{ key: string, count: number, segments: string[] }>,
 *   adaPenandaKop: boolean,
 *   error?: string
 * }}
 */
export async function auditTemplate(accessToken, docId) {
  let marks;
  try {
    marks = await collectMarks(accessToken, docId);
  } catch (e) {
    return {
      ok: false,
      total: 0,
      terisi: [],
      tidakDikenal: [],
      adaPenandaKop: false,
      error: e.message,
    };
  }

  // Sengaja exact-match: replacePlaceholders() memakai matchCase: true, jadi
  // pencocokan longgar akan melaporkan template yang rusak sebagai bersih.
  const known = new Set(knownMarkKeys());
  const terisi = [];
  const tidakDikenal = [];
  let adaPenandaKop = false;

  for (const [key, info] of marks) {
    if (KOP_MARK_RE.test(key)) {
      adaPenandaKop = true;
      continue;
    }
    if (known.has(key)) {
      terisi.push(key);
    } else {
      tidakDikenal.push({ key, count: info.count, segments: info.segments });
    }
  }

  return {
    ok: true,
    total: marks.size,
    terisi: terisi.sort(),
    tidakDikenal: tidakDikenal.sort((a, b) => a.key.localeCompare(b.key)),
    adaPenandaKop,
  };
}

/**
 * Pemeriksaan hasil (setelah membuat).
 *
 * Yang tersisa di dokumen hasil = penanda yang GAGAL terisi. Ini satu-satunya
 * pemeriksaan yang menangkap kasus terburuk: kontrak hukum yang keluar dengan
 * {{t_kesehatan}} tercetak di dalamnya.
 *
 * @returns {{ ok: boolean, unfilled: string[], error: string|null }}
 */
export async function verifyDocument(accessToken, docId) {
  try {
    const marks = await collectMarks(accessToken, docId);
    return { ok: true, unfilled: [...marks.keys()].sort(), error: null };
  } catch (e) {
    // Gagal memverifikasi BUKAN berarti dokumen rusak. Pemeriksa tidak
    // boleh pernah menggagalkan pembuatan dokumen.
    return { ok: false, unfilled: [], error: e.message };
  }
}
