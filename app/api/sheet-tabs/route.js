import { auth } from "@/auth";
import { extractSpreadsheetId, extractGid, getSheetTabs, isValidGoogleId } from "@/lib/sheets";

// GET /api/sheet-tabs?spreadsheetId=<url|id> — list tabs + suggest the gid tab.
export async function GET(req) {
  const session = await auth();
  if (!session?.user?.email || !session.accessToken) {
    return Response.json({ error: "Unauthorized. Keluar lalu masuk kembali." }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("spreadsheetId");
  const spreadsheetId = extractSpreadsheetId(raw);
  if (!isValidGoogleId(spreadsheetId)) {
    return Response.json({ error: "Link tidak valid. Tempel URL lengkap (docs.google.com/spreadsheets/d/...)." }, { status: 400 });
  }
  try {
    const tabs = await getSheetTabs(session.accessToken, spreadsheetId);
    const gid = extractGid(raw);
    const suggestedTab =
      gid != null ? tabs.find((t) => String(t.sheetId) === String(gid))?.title || null : null;
    return Response.json({ tabs, suggestedTab });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
