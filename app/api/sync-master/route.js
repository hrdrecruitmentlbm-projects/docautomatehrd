import { auth } from "@/auth";
import {
  extractSpreadsheetId,
  getSheetTabs,
  readTabValues,
} from "@/lib/sheets";
import { syncMasterAoa, persistSettingsForUser } from "@/lib/sync";

// POST /api/sync-master — body { sheetUrl | spreadsheetId, tab? }.
// Reads the master Google Sheet live via your login, then upserts employees.
export async function POST(req) {
  const session = await auth();
  if (!session?.user?.email || !session.accessToken) {
    return Response.json({ error: "Unauthorized. Keluar lalu masuk kembali." }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const spreadsheetId = extractSpreadsheetId(body?.spreadsheetId || body?.sheetUrl);
  if (!spreadsheetId) {
    return Response.json({ error: "Link spreadsheet master wajib diisi" }, { status: 400 });
  }

  try {
    const tabs = await getSheetTabs(session.accessToken, spreadsheetId);
    if (tabs.length === 0) {
      return Response.json({ error: "Spreadsheet tidak punya tab." }, { status: 400 });
    }
    const tab = body?.tab && tabs.includes(body.tab) ? body.tab : tabs[0];
    const aoa = await readTabValues(session.accessToken, spreadsheetId, tab);
    const result = await syncMasterAoa(aoa, tab);

    const persistHint = await persistSettingsForUser(session.user.email, {
      master_sheet_url: body?.sheetUrl || body?.spreadsheetId || spreadsheetId,
      master_tab: tab,
    });

    return Response.json({ ...result, tabs, tab, persistHint });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
