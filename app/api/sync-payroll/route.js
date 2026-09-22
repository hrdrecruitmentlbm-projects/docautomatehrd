import { auth } from "@/auth";
import {
  extractFolderId,
  extractFileId,
  extractGid,
  isValidGoogleId,
  listSpreadsheetFiles,
  pickNewestFile,
  extractPeriode,
  readDriveFileAsAoa,
} from "@/lib/sheets";
import { syncPayrollAoa, persistSettingsForUser } from "@/lib/sync";

// Folder listing + full read in one request: give it room on Vercel.
export const maxDuration = 60;

// POST /api/sync-payroll — body { folderUrl | folderId } or { sheetUrl | spreadsheetId, tab?, periode_bulan? }.
// Folder mode: picks the newest payroll file automatically (YYYY-MM in name wins).
export async function POST(req) {
  const session = await auth();
  if (!session?.user?.email || !session.accessToken) {
    return Response.json({ error: "Unauthorized. Keluar lalu masuk kembali." }, { status: 401 });
  }
  const body = await req.json().catch(() => null);

  try {
    const rawSheet = body?.spreadsheetId || body?.sheetUrl || "";
    const directId = extractFileId(rawSheet);
    if (directId) {
      if (!isValidGoogleId(directId)) {
        return Response.json({ error: "Link file payroll tidak valid. Tempel URL lengkap." }, { status: 400 });
      }
      // A pasted file URL often points at a specific tab (?gid=...): honor it.
      const gid = extractGid(rawSheet);
      let aoa;
      let tab;
      if (body?.tab && gid == null) {
        tab = body.tab;
        aoa = await readTabValues(session.accessToken, directId, tab);
      } else {
        ({ aoa, tab } = await readDriveFileAsAoa(
          session.accessToken,
          { id: directId, mimeType: "application/vnd.google-apps.spreadsheet" },
          { tabTitle: body?.tab, gid }
        ));
      }
      const periode = body?.periode_bulan || new Date().toISOString().slice(0, 7);
      const result = await syncPayrollAoa(aoa, periode);
      return Response.json({ ...result, fileUsed: { name: `Spreadsheet langsung (${tab})` } });
    }

    const folderId = extractFolderId(body?.folderId || body?.folderUrl);
    if (!isValidGoogleId(folderId)) {
      return Response.json({ error: "Link folder tidak valid. Tempel URL folder (.../drive/folders/...) atau link file spreadsheet langsung." }, { status: 400 });
    }
    const files = await listSpreadsheetFiles(session.accessToken, folderId);
    if (files.length === 0) {
      return Response.json({ error: "Tidak ada file spreadsheet di folder tersebut." }, { status: 400 });
    }
    const picked = pickNewestFile(files);
    const { aoa, tab } = await readDriveFileAsAoa(session.accessToken, picked.file);
    const periode = picked.periode || extractPeriode("", picked.file.modifiedTime) || new Date().toISOString().slice(0, 7);
    const result = await syncPayrollAoa(aoa, periode);

    const persistHint = await persistSettingsForUser(session.user.email, {
      payroll_folder_url: body?.folderUrl || body?.folderId || folderId,
    });

    return Response.json({
      ...result,
      fileUsed: { name: picked.file.name, modifiedTime: picked.file.modifiedTime, tab },
      files: files.slice(0, 10).map((f) => ({ name: f.name, modifiedTime: f.modifiedTime })),
      persistHint,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
