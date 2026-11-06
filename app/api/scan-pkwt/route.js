import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { getDriveClient, extractFolderId, isValidGoogleId } from "@/lib/sheets";
import {
  extractDocNumberAndName,
  extractDatesFromContractText,
  extractMonthFromFolderChain,
} from "@/lib/scan-extractor";

export const maxDuration = 60;

const BATCH_SIZE = 15;
const MAX_DEPTH = 6;
const FOLDER_MIME = "application/vnd.google-apps.folder";
const GDOC_MIME = "application/vnd.google-apps.document";

// Retry helper untuk menangani rate limit 429 dari Google Drive
async function withDriveRetry(fn, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const status = err?.status || err?.code || err?.response?.status;
      const msg = err?.message || err?.response?.data?.error?.message || "";
      const isRateLimit = status === 429 || /rateLimitExceeded|userRateLimitExceeded|quotaExceeded/i.test(msg);
      if (isRateLimit && attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1200 * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }
  }
}

export async function POST(req) {
  try {
    const session = await auth();
    if (session?.error) {
      return Response.json({ error: "Sesi Google berakhir, silakan login ulang" }, { status: 401 });
    }
    if (!session?.user?.email) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!session?.accessToken) {
      return Response.json({ error: "Token Google tidak ditemukan, silakan login ulang" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const mode = String(body?.mode || "dry-run").toLowerCase() === "execute" ? "execute" : "dry-run";
    const cursor = body?.cursor || null;

    const drive = getDriveClient(session.accessToken);

    let folderQueue = [];
    let fileQueue = [];
    let exclusions = [];
    let templateIds = [];

    // =========================================================================
    // 1. Inisialisasi Cursor jika batch pertama
    // =========================================================================
    if (!cursor) {
      // Ambil root yang aktif dari tabel pkwt_scan_roots
      const { data: dbRoots, error: rootsErr } = await supabaseAdmin
        .from("pkwt_scan_roots")
        .select("*")
        .eq("aktif", true)
        .order("id", { ascending: true });

      if (rootsErr) {
        return Response.json({ error: `Gagal membaca pkwt_scan_roots: ${rootsErr.message}` }, { status: 500 });
      }

      if (!dbRoots || dbRoots.length === 0) {
        return Response.json(
          { error: "Tidak ada root folder yang aktif. Konfigurasikan dan aktifkan folder di menu Sumber Folder Drive." },
          { status: 400 }
        );
      }

      // Ambil daftar exclusions
      const { data: dbExclusions } = await supabaseAdmin
        .from("pkwt_scan_exclusions")
        .select("pola");
      exclusions = (dbExclusions || []).map((e) => String(e.pola || "").trim().toLowerCase()).filter(Boolean);

      // Ambil template IDs untuk diabaikan
      const templateSet = new Set();
      const { data: settings } = await supabaseAdmin
        .from("settings")
        .select("pkwt_template_id, sk_template_id, memo_template_id, sp_template_id")
        .limit(1);
      if (settings?.[0]) {
        Object.values(settings[0]).forEach((v) => { if (v) templateSet.add(v); });
      }
      const { data: mapRows } = await supabaseAdmin
        .from("company_map")
        .select("pkwt_template_id, paklaring_template_id");
      (mapRows || []).forEach((m) => {
        if (m.pkwt_template_id) templateSet.add(m.pkwt_template_id);
        if (m.paklaring_template_id) templateSet.add(m.paklaring_template_id);
      });
      templateIds = Array.from(templateSet);

      // Masukkan root folder ke antrean folder
      for (const r of dbRoots) {
        const cleanId = extractFolderId(r.folder_id);
        if (cleanId && isValidGoogleId(cleanId)) {
          folderQueue.push({
            id: cleanId,
            name: r.label || "Root",
            depth: 0,
            folderChain: [r.label || "Root"],
          });
        }
      }
    } else {
      folderQueue = cursor.folderQueue || [];
      fileQueue = cursor.fileQueue || [];
      exclusions = cursor.exclusions || [];
      templateIds = cursor.templateIds || [];
    }

    // =========================================================================
    // 2. Eksplorasi Folder sampai fileQueue memiliki cukup item atau folderQueue habis
    // =========================================================================
    while (fileQueue.length < BATCH_SIZE && folderQueue.length > 0) {
      const currentFolder = folderQueue.shift();

      let pageToken = null;
      do {
        let res;
        try {
          res = await withDriveRetry(() =>
            drive.files.list({
              q: `'${currentFolder.id}' in parents and trashed = false`,
              fields: "nextPageToken, files(id, name, mimeType, modifiedTime, createdTime, shortcutDetails)",
              pageSize: 100,
              pageToken,
              supportsAllDrives: true,
              includeItemsFromAllDrives: true,
            })
          );
        } catch (e) {
          console.warn(`Gagal membaca folder "${currentFolder.name}" (${currentFolder.id}):`, e.message);
          break;
        }

        const files = res.data.files || [];
        for (const item of files) {
          const itemName = item.name || "";
          const itemLower = itemName.toLowerCase();

          // Cek apakah terkena pola pengecualian
          const matchedExclusion = exclusions.find((p) => itemLower.includes(p));
          if (matchedExclusion) {
            // Lewati folder atau file yang cocok dengan exclusion
            continue;
          }

          if (item.mimeType === FOLDER_MIME) {
            // Subfolder: telusuri hingga batas 6 tingkat
            if (currentFolder.depth + 1 <= MAX_DEPTH) {
              folderQueue.push({
                id: item.id,
                name: itemName,
                depth: currentFolder.depth + 1,
                folderChain: [...currentFolder.folderChain, itemName],
              });
            }
          } else {
            // File: masukkan ke antrean pemrosesan file
            fileQueue.push({
              id: item.id,
              name: itemName,
              mimeType: item.mimeType,
              modifiedTime: item.modifiedTime,
              createdTime: item.createdTime,
              shortcutDetails: item.shortcutDetails,
              folderChain: currentFolder.folderChain,
              parentFolder: currentFolder.name,
            });
          }
        }

        pageToken = res.data.nextPageToken;
      } while (pageToken && fileQueue.length < BATCH_SIZE * 2);
    }

    // =========================================================================
    // 3. Proses Batch File (Maksimal 15 file)
    // =========================================================================
    const filesToProcess = fileQueue.splice(0, BATCH_SIZE);

    const report = {
      scanned: 0,
      saved: 0,
      skipped: [],
      needsCheck: [],
      unmatchedEmployees: [],
      items: [],
    };

    if (filesToProcess.length > 0) {
      // Batch fetch cache status dari pkwt_source di database
      const fileIds = filesToProcess.map((f) => f.id);
      const { data: existingRows } = await supabaseAdmin
        .from("pkwt_source")
        .select("file_id, drive_modified_time, manual_override")
        .in("file_id", fileIds);

      const existingMap = new Map((existingRows || []).map((r) => [r.file_id, r]));

      // Ambil daftar karyawan untuk pencocokan nama
      const { data: allEmployees } = await supabaseAdmin
        .from("employees")
        .select("nama_key, nama_asli, lini_bisnis");
      const employeeMap = new Map((allEmployees || []).map((e) => [e.nama_key, e]));

      for (const file of filesToProcess) {
        report.scanned += 1;
        const fileName = file.name || "";
        const fileLower = fileName.toLowerCase();

        // ----------------- Filter dan Pengecualian -----------------
        // a. Pola pengecualian
        const matchedExclusion = exclusions.find((p) => fileLower.includes(p));
        if (matchedExclusion) {
          report.skipped.push({ file_id: file.id, name: fileName, reason: `Pola pengecualian ("${matchedExclusion}")` });
          continue;
        }

        // b. Shortcut Drive
        if (file.mimeType === "application/vnd.google-apps.shortcut" || file.shortcutDetails?.targetId) {
          report.skipped.push({ file_id: file.id, name: fileName, reason: "Shortcut Google Drive" });
          continue;
        }

        // c. Spreadsheet
        if (file.mimeType === "application/vnd.google-apps.spreadsheet" || /\.(xlsx?|csv)$/i.test(fileName)) {
          report.skipped.push({ file_id: file.id, name: fileName, reason: "File Spreadsheet / Excel" });
          continue;
        }

        // d. File template
        if (templateIds.includes(file.id) || fileLower.includes("template")) {
          report.skipped.push({ file_id: file.id, name: fileName, reason: "File Template" });
          continue;
        }

        // e. File gambar
        if (String(file.mimeType || "").startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(fileName) || /^KOP\b/i.test(fileName)) {
          report.skipped.push({ file_id: file.id, name: fileName, reason: "File Gambar / KOP" });
          continue;
        }

        // f. Dokumen Non-PKWT (SK / MEMO / SP)
        if (/(?:^|[\s_/-])(?:SK|MEMO|SP[123]?)(?:$|[\s_/-])/i.test(fileName) && !/SPK/i.test(fileName)) {
          report.skipped.push({ file_id: file.id, name: fileName, reason: "Bukan PKWT (SK/Memo/SP)" });
          continue;
        }

        // g. Word / docx unggahan atau format non-Google Docs
        if (file.mimeType !== GDOC_MIME) {
          report.skipped.push({
            file_id: file.id,
            name: fileName,
            reason: `Bukan Google Docs asli (${file.mimeType || "file luar"})`,
          });
          continue;
        }

        // ----------------- Inkremental Cache Check -----------------
        const existing = existingMap.get(file.id);
        if (existing) {
          if (Boolean(existing.manual_override)) {
            report.skipped.push({ file_id: file.id, name: fileName, reason: "Dilewati (manual_override=true di database)" });
            continue;
          }
          if (existing.drive_modified_time && new Date(existing.drive_modified_time).getTime() === new Date(file.modifiedTime).getTime()) {
            report.skipped.push({ file_id: file.id, name: fileName, reason: "Dilewati (tidak berubah sejak scan terakhir)" });
            continue;
          }
        }

        // ----------------- Ekstraksi Data Dokumen -----------------
        const docMeta = extractDocNumberAndName(fileName, file.parentFolder);
        const bulanFolder = extractMonthFromFolderChain(file.folderChain);

        // Ekspor teks plain dari Google Docs
        let textContent = "";
        try {
          const exportRes = await withDriveRetry(() =>
            drive.files.export({
              fileId: file.id,
              mimeType: "text/plain",
            })
          );
          textContent = String(exportRes.data || "");
        } catch (exportErr) {
          console.warn(`Gagal membaca isi dokumen "${fileName}" (${file.id}):`, exportErr.message);
        }

        const dateResult = extractDatesFromContractText(textContent);

        // Evaluasi apakah dokumen memerlukan pengecekan manual
        const issues = [];
        if (!docMeta.nomor_surat) {
          issues.push("Nomor surat tidak teridentifikasi dari nama file");
        }
        if (!docMeta.nama_asli) {
          issues.push("Nama karyawan tidak teridentifikasi dari nama file");
        }
        if (!dateResult.found) {
          issues.push(dateResult.error || "Tanggal kontrak tidak ditemukan di isi dokumen");
        }

        // Pencocokan nama ke master karyawan
        const isMatchedEmployee = docMeta.nama_key ? employeeMap.has(docMeta.nama_key) : false;
        if (docMeta.nama_asli && !isMatchedEmployee) {
          report.unmatchedEmployees.push({
            file_id: file.id,
            nomor_surat: docMeta.nomor_surat,
            nama_asli: docMeta.nama_asli,
            nama_key: docMeta.nama_key,
          });
          issues.push("Nama tidak cocok dengan data master karyawan");
        }

        const perluDicek = issues.length > 0;
        const alasanCek = issues.join("; ");

        const recordPayload = {
          file_id: file.id,
          nomor_surat: docMeta.nomor_surat || fileName,
          nama_asli: docMeta.nama_asli || null,
          nama_key: docMeta.nama_key || null,
          kode_perusahaan: docMeta.kode_perusahaan || null,
          bulan_folder: bulanFolder || null,
          tanggal_mulai: dateResult.tanggal_mulai || null,
          tanggal_berakhir: dateResult.tanggal_berakhir || null,
          jangka_bulan: dateResult.jangka_bulan || null,
          perlu_dicek: perluDicek,
          alasan_cek: alasanCek || null,
          manual_override: false,
          drive_modified_time: file.modifiedTime || new Date().toISOString(),
          url: `https://docs.google.com/document/d/${file.id}/edit`,
          scanned_at: new Date().toISOString(),
        };

        if (perluDicek) {
          report.needsCheck.push({
            file_id: file.id,
            nomor_surat: recordPayload.nomor_surat,
            nama_asli: recordPayload.nama_asli || fileName,
            alasan_cek: alasanCek,
          });
        }

        // Simpan ke Supabase jika mode execute
        if (mode === "execute") {
          const { error: upsertErr } = await supabaseAdmin
            .from("pkwt_source")
            .upsert(recordPayload, { onConflict: "file_id" });

          if (upsertErr) {
            console.error(`Gagal menyimpan baris pkwt_source (${file.id}):`, upsertErr.message);
          } else {
            report.saved += 1;
          }
        } else {
          // Dry-run mode: hitung sebagai simulasi simpan
          report.saved += 1;
        }

        report.items.push({
          file_id: file.id,
          nomor_surat: recordPayload.nomor_surat,
          nama_asli: recordPayload.nama_asli,
          kode_perusahaan: recordPayload.kode_perusahaan,
          bulan_folder: recordPayload.bulan_folder,
          tanggal_mulai: recordPayload.tanggal_mulai,
          tanggal_berakhir: recordPayload.tanggal_berakhir,
          jangka_bulan: recordPayload.jangka_bulan,
          perlu_dicek: perluDicek,
          alasan_cek: alasanCek,
          status: mode === "execute" ? "saved" : "simulated",
        });
      }
    }

    const done = folderQueue.length === 0 && fileQueue.length === 0;

    return Response.json({
      success: true,
      mode,
      done,
      cursor: done
        ? null
        : {
            folderQueue,
            fileQueue,
            exclusions,
            templateIds,
          },
      batch: report,
      remainingFolders: folderQueue.length,
      remainingFiles: fileQueue.length,
    });
  } catch (error) {
    console.error("scan-pkwt route error:", error);
    return Response.json(
      { error: error?.response?.data?.error?.message || error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}
