import { auth } from "@/auth";
import {
  extractSpreadsheetId,
  extractFolderId,
  extractGid,
  getSheetTabs,
  isValidGoogleId,
  listSpreadsheetFiles,
  pickNewestFile,
} from "@/lib/sheets";

// GET /api/sheet-tabs?spreadsheetId=<url|id> — list tabs + suggest the gid tab.
// Mendukung URL spreadsheet langsung maupun URL folder Drive (akan memilih file spreadsheet terbaru di folder tersebut).
export async function GET(req) {
  const session = await auth();
  if (!session?.user?.email || !session.accessToken) {
    return Response.json({ error: "Unauthorized. Keluar lalu masuk kembali." }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("spreadsheetId");
  let spreadsheetId = extractSpreadsheetId(raw);
  let resolvedFileName = null;

  // Jika yang ditempel adalah link folder Drive, ambil file spreadsheet terbaru di dalamnya
  if (!spreadsheetId || !isValidGoogleId(spreadsheetId)) {
    const folderId = extractFolderId(raw);
    if (folderId && isValidGoogleId(folderId)) {
      try {
        const files = await listSpreadsheetFiles(session.accessToken, folderId);
        if (files.length > 0) {
          const picked = pickNewestFile(files);
          if (picked?.file?.id) {
            spreadsheetId = picked.file.id;
            resolvedFileName = picked.file.name;
          }
        } else {
          return Response.json({ error: "Tidak ada file spreadsheet di folder Drive tersebut." }, { status: 400 });
        }
      } catch (err) {
        return Response.json({ error: `Gagal membaca folder Drive: ${err.message}` }, { status: 400 });
      }
    }
  }

  if (!isValidGoogleId(spreadsheetId)) {
    return Response.json({ error: "Link tidak valid. Tempel URL spreadsheet atau folder Drive lengkap." }, { status: 400 });
  }
  try {
    const tabs = await getSheetTabs(session.accessToken, spreadsheetId);
    const gid = extractGid(raw);
    const suggestedTab =
      gid != null ? tabs.find((t) => String(t.sheetId) === String(gid))?.title || null : null;
    return Response.json({ tabs, suggestedTab, spreadsheetId, fileName: resolvedFileName });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}

