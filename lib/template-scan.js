import { google } from 'googleapis';
import { getGoogleClient, collectSegments, fullText } from './google';
import { buildPkwtReplacements } from './pkwt';
import { buildPaklaringReplacements } from './paklaring';

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

/**
 * Penanda GAMBAR ({{kop}}, {{ttd}}). Ditangani oleh insertMarkImage() —
 * dihapus lalu diganti gambar — bukan oleh replacePlaceholders(). Karena itu
 * mereka tidak boleh dilaporkan sebagai "penanda tidak dikenal" saat audit,
 * dan tidak boleh dilaporkan sebagai "belum terisi" saat verifikasi: keduanya
 * akan membuat template/dokumen yang sebenarnya benar terlihat rusak.
 */
const IMAGE_MARKS = [
  { key: "kop", re: /^\s*kop\s*$/i, flag: "adaPenandaKop" },
  { key: "ttd", re: /^\s*ttd\s*$/i, flag: "adaPenandaTtd" },
];

/**
 * Peta jenis dokumen -> pembangun isiannya.
 *
 * INI alasan file ini berparameterisasi. Dulu `knownMarkKeys()` hanya tahu
 * key PKWT, jadi begitu Paklaring diperkenalkan SEMUA penandanya — yang
 * sebenarnya sudah terisi dengan benar — akan dilaporkan sebagai "belum
 * terisi" pada setiap surat, lengkap dengan peringatan merah di layar sukses
 * dan polusi permanen di document_logs.unfilled_marks.
 *
 * Menambah jenis dokumen = menambah satu baris di sini. Tidak ada cara lagi
 * lupa, karena knownMarkKeys() tidak punya default diam-diam untuk tipe baru:
 * tipe yang tidak terdaftar memakai default PKWT dan itu terlihat di audit.
 */
const BUILDERS = {
  pkwt: buildPkwtReplacements,
  paklaring: buildPaklaringReplacements,
};

export const DEFAULT_DOC_TYPE = "pkwt";

/** true kalau jenis ini punya pembangun isian yang terdaftar. */
export function isKnownDocType(docType) {
  return Object.prototype.hasOwnProperty.call(BUILDERS, String(docType || ""));
}

/**
 * Semua penanda yang bisa diisi engine untuk satu jenis dokumen, apa adanya.
 *
 * buildXxxReplacements menerima objek kosong; yang dibutuhkan hanya
 * Object.keys()-nya, jadi nilai isiannya tidak pernah dipakai.
 */
export function knownMarkKeys(docType = DEFAULT_DOC_TYPE) {
  const build = BUILDERS[docType] || BUILDERS[DEFAULT_DOC_TYPE];
  return Object.keys(build({}));
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
 *   adaPenandaTtd: boolean,
 *   docType: string,
 *   error?: string
 * }}
 */
export async function auditTemplate(accessToken, docId, docType = DEFAULT_DOC_TYPE) {
  const flags = { adaPenandaKop: false, adaPenandaTtd: false };
  let marks;
  try {
    marks = await collectMarks(accessToken, docId);
  } catch (e) {
    return {
      ok: false,
      total: 0,
      terisi: [],
      tidakDikenal: [],
      ...flags,
      docType,
      error: e.message,
    };
  }

  // Sengaja exact-match: replacePlaceholders() memakai matchCase: true, jadi
  // pencocokan longgar akan melaporkan template yang rusak sebagai bersih.
  const known = new Set(knownMarkKeys(docType));
  const terisi = [];
  const tidakDikenal = [];

  for (const [key, info] of marks) {
    const image = IMAGE_MARKS.find((m) => m.re.test(key));
    if (image) {
      flags[image.flag] = true;
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
    ...flags,
    docType,
  };
}

/**
 * Pemeriksaan hasil (setelah membuat).
 *
 * Yang tersisa di dokumen hasil = penanda yang GAGAL terisi. Ini satu-satunya
 * pemeriksaan yang menangkap kasus terburuk: kontrak hukum yang keluar dengan
 * {{t_kesehatan}} tercetak di dalamnya.
 *
 * Penanda gambar dikecualikan: {{kop}}/{{ttd}} dihapus oleh insertMarkImage(),
 * jadi kalau masih ada berarti engine gambar tidak sempat jalan — bukan
 * kegagalan pengisian teks, dan tidak bisa diperbaiki dengan mengisi ulang.
 *
 * @param {string} accessToken
 * @param {string} docId
 * @param {string} [docType] jenis dokumen — menentukan himpunan penanda known
 * @returns {{ ok: boolean, unfilled: string[], error: string|null }}
 */
export async function verifyDocument(accessToken, docId, docType = DEFAULT_DOC_TYPE) {
  try {
    const marks = await collectMarks(accessToken, docId);
    const unfilled = [...marks.keys()].filter(
      (key) => !IMAGE_MARKS.some((m) => m.re.test(key))
    );
    return { ok: true, unfilled: unfilled.sort(), error: null };
  } catch (e) {
    // Gagal memverifikasi BUKAN berarti dokumen rusak. Pemeriksa tidak
    // boleh pernah menggagalkan pembuatan dokumen.
    return { ok: false, unfilled: [], error: e.message };
  }
}
