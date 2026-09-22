import { auth } from "@/auth";
import { extractSpreadsheetId, getSheetTabs } from "@/lib/sheets";

// GET /api/sheet-tabs?spreadsheetId=<url|id> — list tab titles for the picker.
export async function GET(req) {
  const session = await auth();
  if (!session?.user?.email || !session.accessToken) {
    return Response.json({ error: "Unauthorized. Keluar lalu masuk kembali." }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const spreadsheetId = extractSpreadsheetId(searchParams.get("spreadsheetId"));
  if (!spreadsheetId) {
    return Response.json({ error: "spreadsheetId wajib diisi" }, { status: 400 });
  }
  try {
    const tabs = await getSheetTabs(session.accessToken, spreadsheetId);
    return Response.json({ tabs });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
