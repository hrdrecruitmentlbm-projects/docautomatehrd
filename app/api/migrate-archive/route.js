import { auth } from "@/auth";
import { google } from "googleapis";
import { supabaseAdmin } from "@/lib/supabase";
import { getGoogleClient } from "@/lib/google";
import { getOrCreateFolder } from "@/lib/drive-folders";
import { extractFolderId, isValidGoogleId } from "@/lib/sheets";
import { formatMonthYearId } from "@/lib/pkwt";

// POST /api/migrate-archive — satu kali: pindahkan PKWT lama yang numpuk rata
// di root folder ke struktur arsip:
//
//   <root>/<Bulan Tahun>/<KODE PERUSAHAAN>/
//
// Body:
//   { mode?: "dry-run" | "execute",      // default "dry-run" (hanya laporan)
//     rootFolderId?: string,             // batasi ke SATU root (URL/id); default = semua config
//     targetRootFolderId?: string }      // semua file pindah ke bawah root INI
//                                         // (default: masing-masing root asal)
//
// Aturan klasifikasi:
//   - Bulan  <- createdTime file (keputusan: tanggal pembuatan).
//   - Kode   <- inti nama hasil generate: "SPK_HRD-<KODE>_INT." dari nomor surat
//               (prefix apa pun di depannya diabaikan — file bisa sudah diedit
//               manual, cth "24/9 00236_ SPK_HRD-NUMETA_INT..." -> NUMETA).
//   - Lewati : subfolder, shortcut, file template, gambar "KOP *",
//               non-PKWT (SK/MEMO/SP), dan file yang tidak dikenali.
//   - Pindah <- files.update addParents/removeParents: ID & URL dokumen TIDAK
//               berubah, semua link lama tetap hidup.
//   - File milik orang lain pindah bila akun ini punya izin edit; kalau tidak
//               ia masuk daftar "failed" dan dilaporkan (tidak menggagalkan run).
//
// Setiap root membawa `sources` (baris config mana yang menunjuk ke sana) supaya
// folder root yang salah/corrupt mudah dilacak ke Settings / halaman Data.

export const maxDuration = 60;

const FOLDER_MIME = "application/vnd.google-apps.folder";
// Inti nama file hasil generate: "00016_ SPK_HRD-MJO_INT.23_IX_2026 - Anindya ..."
// Tanpa jangkar `^` supaya prefix manual di depan (mis. "24/9 ") tidak bikin
// file gagal dikenali.
const GENERATED_RE = /([A-Za-z0-9]+)_HRD-([A-Za-z0-9][A-Za-z0-9 _.-]*?)_INT\./;

export async function POST(req) {
  try {
    const session = await auth();
    if (!session || !session.user || !session.accessToken) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const body = await req.json().catch(() => ({}));
    const mode = String(body?.mode || "dry-run").toLowerCase() === "execute" ? "execute" : "dry-run";
    const drive = google.drive({ version: "v3", auth: getGoogleClient(session.accessToken) });

    // ---- Root folder(s) & daftar ID template (untuk dilewati) ----
    // Nilai config bisa berupa ID mentah ATAU URL Drive yang ditempel user ->
    // selalu dinormalisasi; nilai yang tidak terbaca dilaporkan, bukan membuat
    // query Drive meledak jadi 500.
    const templateIds = new Set();
    const roots = new Set();
    const rootSources = new Map(); // folder ID -> [asal config, ...]
    const invalidRoots = [];
    const addRoot = (raw, source) => {
      const v = String(raw || "").trim();
      if (!v) return false;
      const id = extractFolderId(v);
      if (id && isValidGoogleId(id)) {
        roots.add(id);
        rootSources.set(id, [...(rootSources.get(id) || []), source]);
        return true;
      }
      invalidRoots.push({ source, value: v.slice(0, 160) });
      return false;
    };

    if (body?.rootFolderId) {
      if (!addRoot(body.rootFolderId, "request.rootFolderId")) {
        return Response.json({ error: "rootFolderId tidak valid", invalidRoots }, { status: 400 });
      }
    } else {
      const { data: settings } = await supabaseAdmin
        .from("settings")
        .select("*")
        .eq("user_email", session.user.email)
        .limit(1);
      const s = settings?.[0];
      addRoot(s?.pkwt_folder_id, "settings.pkwt_folder_id");
      for (const v of [s?.pkwt_template_id, s?.sk_template_id, s?.memo_template_id, s?.sp_template_id]) {
        if (v) templateIds.add(v);
      }

      const { data: maps } = await supabaseAdmin
        .from("company_map")
        .select("*")
        .limit(1000);
      for (const m of maps || []) {
        addRoot(m.pkwt_folder_id, `company_map.${m.lini_bisnis}`);
        if (m.pkwt_template_id) templateIds.add(m.pkwt_template_id);
      }
    }

    if (roots.size === 0) {
      return Response.json({
        error: invalidRoots.length
          ? "Tidak ada root folder yang valid — semua nilai config bukan ID/URL Drive yang terbaca."
          : "Folder root PKWT belum dikonfigurasi. Isi Folder ID PKWT di Settings/Data, atau kirim rootFolderId di body.",
        invalidRoots,
      }, { status: 400 });
    }

    // ---- Target root opsional: semua file dikumpulkan ke bawah SATU root ----
    // (default: masing-masing root mengarsipkan file-nya sendiri, di tempat).
    let targetRoot = null;
    if (body?.targetRootFolderId) {
      const id = extractFolderId(body.targetRootFolderId);
      if (!id || !isValidGoogleId(id)) {
        return Response.json({ error: "targetRootFolderId tidak valid" }, { status: 400 });
      }
      targetRoot = { id, name: await safeFolderName(drive, id) };
    }

    const items = [];
    const rootErrors = [];
    const rootReport = [];
    for (const rootId of roots) {
      // Nama folder hanya untuk laporan (best-effort).
      const name = await safeFolderName(drive, rootId);
      // ---- Klasifikasi (read-only) ----
      let classified;
      try {
        classified = await classifyRoot(drive, rootId, templateIds);
      } catch (e) {
        // Satu root bermasalah tidak boleh membatalkan seluruh laporan.
        rootErrors.push({ id: rootId, name, sources: rootSources.get(rootId) || [], error: describeDriveError(e) });
        continue;
      }
      rootReport.push({ id: rootId, name, files: classified.length, sources: rootSources.get(rootId) || [] });

      const destRootId = targetRoot?.id || rootId;
      const destRootName = (targetRoot ? targetRoot.name : name) || destRootId;
      for (const item of classified) {
        if (item.action === "move") item.targetPath = `${destRootName}/${item.month}/${item.division}`;
      }
      items.push(...classified);

      if (mode !== "execute") continue;

      // ---- Eksekusi: folder arsip dibuat saat perlu, lalu file dipindah ----
      const memo = new Map();
      let folderColumnOk = true;
      for (const item of classified) {
        if (item.action !== "move") continue;
        try {
          const monthId = await getOrCreateFolder(session.accessToken, destRootId, item.month, memo);
          const targetId = await getOrCreateFolder(session.accessToken, monthId, item.division, memo);
          await drive.files.update({
            fileId: item.id,
            addParents: [targetId],
            removeParents: [rootId], // root ASAL — aman meski target root berbeda
            fields: "id",
          });
          item.action = "moved";
          if (folderColumnOk) {
            await logFolderLocation(item.id, targetId, item.targetPath, () => { folderColumnOk = false; });
          }
        } catch (e) {
          item.action = "failed";
          item.error = describeDriveError(e);
        }
      }
    }

    const summary = { move: 0, moved: 0, skip: 0, failed: 0 };
    for (const i of items) summary[i.action] = (summary[i.action] || 0) + 1;

    return Response.json({
      success: summary.failed === 0 && rootErrors.length === 0 && invalidRoots.length === 0,
      mode,
      roots: rootReport,
      targetRoot,
      rootErrors,
      invalidRoots,
      summary,
      total: items.length,
      items,
    });
  } catch (error) {
    console.error("migrate-archive error:", error);
    return Response.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}

// Listing + klasifikasi per file. Murni baca: tidak membuat folder apa pun.
async function safeFolderName(drive, folderId) {
  try {
    const res = await drive.files.get({ fileId: folderId, fields: "name" });
    return res.data.name || null;
  } catch {
    return null; // ID tidak terbaca -> laporan tetap jalan tanpa nama
  }
}

async function classifyRoot(drive, rootId, templateIds) {
  const items = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      q: `'${rootId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id,name,mimeType,createdTime,shortcutDetails)",
      pageSize: 1000,
      pageToken,
    });
    for (const f of res.data.files || []) {
      items.push(classifyFile(f, rootId, templateIds));
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return items;
}

function classifyFile(f, rootId, templateIds) {
  const base = { id: f.id, name: f.name, rootId };
  const skip = (reason) => ({ ...base, action: "skip", reason });

  if (f.mimeType === FOLDER_MIME) return skip("subfolder — sudah di struktur arsip");
  if (f.shortcutDetails?.targetId) return skip("shortcut — file aslinya di lokasi lain");
  if (templateIds.has(f.id)) return skip("file template");
  if (String(f.mimeType || "").startsWith("image/") || /^KOP\b/i.test(f.name)) return skip("gambar KOP");

  const m = String(f.name || "").match(GENERATED_RE);
  if (m) {
    const docCode = m[1].toUpperCase();
    const division = String(m[2] || "").trim().toUpperCase().replace(/[\\/]+/g, "") || "UMUM";
    const month = formatMonthYearId(new Date(f.createdTime));
    if (docCode !== "SPK") return skip(`bukan PKWT (dokumen ${docCode})`);
    if (!month) return skip("createdTime tidak terbaca — bulan tujuan tidak bisa ditentukan");
    return { ...base, action: "move", month, division, createdTime: f.createdTime };
  }
  return skip("tidak dikenali (bukan dokumen hasil generate) — biarkan di root");
}

// Update kolom arsip di document_logs (best-effort). Bila kolom belum ada
// (pkwt-archive.sql belum dijalankan) -> berhenti mencoba, jangan spam error.
async function logFolderLocation(docId, folderId, folderPath, onColumnMissing) {
  try {
    const { error } = await supabaseAdmin
      .from("document_logs")
      .update({ folder_id: folderId, folder_path: folderPath })
      .eq("google_doc_id", docId);
    if (error && /column/i.test(error.message || "")) onColumnMissing();
    else if (error) console.error("document_logs folder update failed:", error.message);
  } catch {
    /* logging must never break migration */
  }
}

function describeDriveError(e) {
  const status = e?.response?.status;
  const msg = e?.response?.data?.error?.message || e?.message || String(e);
  if (status === 403) return `tidak punya izin edit pada file ini — ${msg}`;
  if (status === 404) return `file tidak ditemukan (mungkin sudah dipindah) — ${msg}`;
  return msg;
}
