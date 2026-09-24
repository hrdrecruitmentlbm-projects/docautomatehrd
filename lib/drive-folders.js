// Get-or-create folder Drive per (parent, nama) untuk arsip PKWT:
//   HRIS PKWT / "September 2026" / "MJO"
//
// ID folder di-cache di tabel drive_folders (unique parent_id + name) supaya
// dua request serverless yang berbarengan tidak pernah membuat folder kembar.
// Kegagalan cache TIDAK boleh menggagalkan pembuatan dokumen: semua jalan
// kembali ke list/create langsung ke Drive.

import { google } from "googleapis";
import { supabaseAdmin } from "./supabase";
import { getGoogleClient } from "./google";

const FOLDER_MIME = "application/vnd.google-apps.folder";
// Skema lama (tabel/kolom belum ada) -> senyap, cache dilewati.
const SCHEMA_ERR = /relation|schema|table|column|does not exist/i;
// Klaim kosong yang lebih tua dari ini dianggap crash dan boleh diambil alih.
const CLAIM_STALE_MS = 60_000;
const WAIT_TIMEOUT_MS = 6_000;
const WAIT_POLL_MS = 400;

// Escape untuk query Drive: nama folder (mis. September 2026) aman.
const esc = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

function drive(accessToken) {
  return google.drive({ version: "v3", auth: getGoogleClient(accessToken) });
}

// ---------------- cache (best-effort) ----------------

async function cacheRead(parentId, name) {
  try {
    const { data, error } = await supabaseAdmin
      .from("drive_folders")
      .select("folder_id, created_at")
      .eq("parent_id", parentId)
      .eq("name", name)
      .limit(1);
    if (error) {
      if (!SCHEMA_ERR.test(error.message || "")) console.error("drive_folders read error:", error.message);
      return null;
    }
    return data?.[0] || null;
  } catch (e) {
    console.error("drive_folders read failed:", e.message);
    return null;
  }
}

async function cacheUpdate(parentId, name, folderId) {
  try {
    const { error } = await supabaseAdmin.from("drive_folders").upsert(
      { parent_id: parentId, name, folder_id: folderId, created_at: new Date().toISOString() },
      { onConflict: "parent_id,name" }
    );
    if (error && !SCHEMA_ERR.test(error.message || "")) console.error("drive_folders write error:", error.message);
  } catch (e) {
    console.error("drive_folders write failed:", e.message);
  }
}

async function cacheDelete(parentId, name) {
  try {
    await supabaseAdmin.from("drive_folders").delete().eq("parent_id", parentId).eq("name", name);
  } catch (e) {
    console.error("drive_folders delete failed:", e.message);
  }
}

// Klaim hak membuat folder. Hasil:
//   { owner: true }                      -> giliran kita create
//   { owner: false, folderId }           -> pihak lain sudah punya ID-nya
//   { owner: false, pending: true }      -> pihak lain sedang create, tunggu
//   null                                 -> cache tidak dipakai, bebas create
async function cacheClaim(parentId, name) {
  try {
    const { data, error } = await supabaseAdmin
      .from("drive_folders")
      .upsert(
        { parent_id: parentId, name, folder_id: "", created_at: new Date().toISOString() },
        { onConflict: "parent_id,name", ignoreDuplicates: true }
      )
      .select("folder_id, created_at");
    if (error) {
      if (!SCHEMA_ERR.test(error.message || "")) console.error("drive_folders claim error:", error.message);
      return null;
    }
    if (data && data.length > 0) return { owner: true }; // baris baru masuk -> kita yang klaim
    const row = await cacheRead(parentId, name);
    if (!row) return { owner: true }; // hilang lagi -> anggap bebas
    if (row.folder_id) return { owner: false, folderId: row.folder_id, pending: false };
    const age = Date.now() - new Date(row.created_at || 0).getTime();
    if (Number.isFinite(age) && age < CLAIM_STALE_MS) return { owner: false, folderId: null, pending: true };
    return { owner: true }; // klaim basi (crash) -> ambil alih
  } catch (e) {
    console.error("drive_folders claim failed:", e.message);
    return null;
  }
}

async function waitForClaimedFolder(parentId, name) {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const row = await cacheRead(parentId, name);
    if (row?.folder_id) return row.folder_id;
    await new Promise((r) => setTimeout(r, WAIT_POLL_MS));
  }
  return null;
}

// ---------------- Drive ----------------

async function findFolder(accessToken, parentId, name) {
  const res = await drive(accessToken).files.list({
    q: `'${parentId}' in parents and name = '${esc(name)}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
    fields: "files(id,name)",
    pageSize: 1,
  });
  return res.data.files?.[0] || null;
}

async function createFolder(accessToken, parentId, name) {
  const res = await drive(accessToken).files.create({
    requestBody: { name, mimeType: FOLDER_MIME, parents: [parentId] },
    fields: "id",
  });
  return res.data.id;
}

// true kecuali folder benar-benar hilang (404/410). Error lain (mis. 403)
// dianggap ada supaya kita tidak membuat duplikat karena salah baca izin.
async function folderExists(accessToken, folderId) {
  try {
    await drive(accessToken).files.get({ fileId: folderId, fields: "id" });
    return true;
  } catch (e) {
    const status = e?.response?.status;
    return !(status === 404 || status === 410);
  }
}

/**
 * Ambil ID folder `name` di bawah `parentId`, buat bila belum ada.
 * @param {string} accessToken OAuth user (harus punya izin tulis di parent)
 * @param {string} parentId folder induk
 * @param {string} name nama folder, cth "September 2026" / "MJO"
 * @param {Map} [memo] cache per-request (hemat API call saat batch)
 * @returns {Promise<string>} folder ID
 */
export async function getOrCreateFolder(accessToken, parentId, name, memo = new Map()) {
  if (!parentId || !name) throw new Error("getOrCreateFolder: parentId/name wajib diisi");

  const key = `${parentId}::${name}`;
  if (memo.has(key)) return memo.get(key);

  // 1. Cache valid?
  const cached = await cacheRead(parentId, name);
  if (cached?.folder_id) {
    if (await folderExists(accessToken, cached.folder_id)) {
      memo.set(key, cached.folder_id);
      return cached.folder_id;
    }
    await cacheDelete(parentId, name); // dihapus manual di Drive -> buat ulang
  }

  // 2. Sudah ada di Drive tanpa baris cache (dibuat lama / manual).
  const found = await findFolder(accessToken, parentId, name);
  if (found) {
    await cacheUpdate(parentId, name, found.id);
    memo.set(key, found.id);
    return found.id;
  }

  // 3. Belum ada -> klaim dulu (unique parent+name) lalu create.
  const claim = await cacheClaim(parentId, name);
  if (claim && !claim.owner) {
    if (claim.folderId) {
      memo.set(key, claim.folderId);
      return claim.folderId;
    }
    if (claim.pending) {
      const waited = await waitForClaimedFolder(parentId, name);
      if (waited) {
        memo.set(key, waited);
        return waited;
      }
      // penciptanya macet -> lanjut create sendiri, baris cache disalin nanti.
    }
  }

  const createdId = await createFolder(accessToken, parentId, name);
  await cacheUpdate(parentId, name, createdId);
  memo.set(key, createdId);
  return createdId;
}
