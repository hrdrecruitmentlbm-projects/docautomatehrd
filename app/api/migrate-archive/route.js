import { auth } from "@/auth";
import { google } from "googleapis";
import { supabaseAdmin } from "@/lib/supabase";
import { getGoogleClient } from "@/lib/google";
import { getOrCreateFolder } from "@/lib/drive-folders";
import { extractFolderId, isValidGoogleId } from "@/lib/sheets";
import { formatMonthYearId } from "@/lib/pkwt";

// POST /api/migrate-archive — satu kali: pindahkan PKWT lama yang numpuk rata
// di root folder (HRIS PKWT) ke struktur arsip:
//
//   HRIS PKWT/<Bulan Tahun>/<KODE PERUSAHAAN>/
//
// Body:
//   { mode?: "dry-run" | "execute",   // default "dry-run" (hanya laporan)
//     rootFolderId?: string }         // URL/id root; default = gabungan config
//
// Aturan klasifikasi:
//   - Bulan  <- createdTime file (keputusan: tanggal pembuatan).
//   - Kode   <- pola nama hasil generate: `00016_ SPK_HRD-MJO_INT.23_IX_2026 - Nama`
//               (segmen setelah HRD-, huruf besar; sama dengan company_code /data).
//   - Lewati : subfolder, shortcut, file template, gambar "KOP *",
//               non-PKWT (SK/MEMO/SP), dan file yang tidak dikenali.
//   - Pindah <- files.update addParents/removeParents: ID & URL dokumen TIDAK
//               berubah, semua link lama tetap hidup.
//   - File milik orang lain pindah bila akun ini punya izin edit; kalau tidak
//               ia masuk daftar "failed" dan dilaporkan (tidak menggagalkan run).

export const maxDuration = 60;

const FOLDER_MIME = "application/vnd.google-apps.folder";
// Nama file hasil generate: "00016_ SPK_HRD-MJO_INT.23_IX_2026 - Anindya ..."
const GENERATED_RE = /^\d+_\s*([A-Za-z]+)_HRD-(.+?)_INT\./;

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
    const templateIds = new Set();
    const roots = new Set();

    const explicit = body?.rootFolderId ? extractFolderId(body.rootFolderId) : "";
    if (explicit) {
      if (!isValidGoogleId(explicit)) {
        return Response.json({ error: "rootFolderId tidak valid" }, { status: 400 });
      }
      roots.add(explicit);
    } else {
      const { data: settings } = await supabaseAdmin
        .from("settings")
        .select("pkwt_folder_id, pkwt_template_id, sk_template_id, memo_template_id, sp_template_id")
        .eq("user_email", session.user.email)
        .limit(1);
      const s = settings?.[0];
      if (s?.pkwt_folder_id) roots.add(s.pkwt_folder_id);
      for (const v of [s?.pkwt_template_id, s?.sk_template_id, s?.memo_template_id, s?.sp_template_id]) {
        if (v) templateIds.add(v);
      }

      const { data: maps } = await supabaseAdmin
        .from("company_map")
        .select("pkwt_folder_id, pkwt_template_id")
        .limit(1000);
      for (const m of maps || []) {
        if (m.pkwt_folder_id) roots.add(m.pkwt_folder_id);
        if (m.pkwt_template_id) templateIds.add(m.pkwt_template_id);
      }
    }

    if (roots.size === 0) {
      return Response.json({
        error: "Folder root PKWT belum dikonfigurasi. Isi Folder ID PKWT di Settings/Data, atau kirim rootFolderId di body.",
      }, { status: 400 });
    }

    const items = [];
    for (const rootId of roots) {
      // ---- Klasifikasi (read-only) ----
      const classified = await classifyRoot(drive, rootId, templateIds);
      items.push(...classified);

      if (mode !== "execute") continue;

      // ---- Eksekusi: folder arsip dibuat saat perlu, lalu file dipindah ----
      const memo = new Map();
      let folderColumnOk = true;
      for (const item of classified) {
        if (item.action !== "move") continue;
        try {
          const monthId = await getOrCreateFolder(session.accessToken, rootId, item.month, memo);
          const targetId = await getOrCreateFolder(session.accessToken, monthId, item.division, memo);
          await drive.files.update({
            fileId: item.id,
            addParents: [targetId],
            removeParents: [rootId],
            fields: "id",
          });
          item.action = "moved";
          item.targetPath = `${item.month}/${item.division}`;
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
      success: summary.failed === 0,
      mode,
      roots: [...roots],
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
