import { after } from "next/server";
import { auth } from "@/auth";
import {
  extractSpreadsheetId,
  getSheetTabs,
  isValidGoogleId,
  quoteTab,
  readRangeValues,
  readTabValues,
} from "@/lib/sheets";
import { mapMasterRows } from "@/lib/spreadsheet";
import { syncMasterAoa, upsertEmployees, findMasterHeaderIndex, persistSettingsForUser } from "@/lib/sync";

const CHUNK_ROWS = 40;

// Big-tab safety: allow the function to run longer than the default budget.
export const maxDuration = 60;

// POST /api/sync-master — three modes (chunked sync keeps big tabs fast):
// { sheetUrl, tab?, probe: true }            -> { tab, headerRow, headerIndex, totalRows }
// { sheetUrl, tab, headers, startRow, endRow } -> { synced } (one 40-row chunk)
// { sheetUrl, tab }                            -> legacy full sync
export async function POST(req) {
  const session = await auth();
  if (!session?.user?.email || !session.accessToken) {
    return Response.json({ error: "Unauthorized. Keluar lalu masuk kembali." }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const spreadsheetId = extractSpreadsheetId(body?.spreadsheetId || body?.sheetUrl);
  if (!isValidGoogleId(spreadsheetId)) {
    return Response.json({ error: "Link master tidak valid. Tempel URL lengkap (docs.google.com/spreadsheets/d/...)." }, { status: 400 });
  }

  try {
    // ---- Probe: tiny reads only (header block + first column for row count)
    if (body?.probe) {
      let tab = body?.tab;
      let tabs = null;
      if (!tab) {
        tabs = await getSheetTabs(session.accessToken, spreadsheetId);
        if (tabs.length === 0) {
          return Response.json({ error: "Spreadsheet tidak punya tab." }, { status: 400 });
        }
        tab = tabs[0].title;
      }
      const head = await readRangeValues(session.accessToken, spreadsheetId, `${quoteTab(tab)}!A1:AZ80`);
      const headerIdx = findMasterHeaderIndex(head);
      if (headerIdx < 0) {
        return Response.json({ error: 'Baris header NAMA tidak ditemukan di 80 baris pertama tab ini.' }, { status: 400 });
      }
      const headerRow = head[headerIdx].map((c) => String(c ?? ""));
      const headerIndex = headerIdx + 1; // 1-based row number
      const firstCol = await readRangeValues(
        session.accessToken, spreadsheetId, `${quoteTab(tab)}!A${headerIndex + 1}:A2000`
      );
      const totalRows = firstCol.filter((r) => String(r[0] ?? "").trim() !== "").length;
      return Response.json({ tab, tabs, headerRow, headerIndex, totalRows });
    }

    // ---- Chunk: one small window + one small upsert
    if (Array.isArray(body?.headers) && body?.startRow) {
      const tab = body.tab;
      if (!tab) return Response.json({ error: "tab wajib diisi" }, { status: 400 });
      const startRow = parseInt(body.startRow, 10);
      const endRow = parseInt(body.endRow, 10) || startRow + CHUNK_ROWS - 1;
      const rows = await readRangeValues(
        session.accessToken, spreadsheetId, `${quoteTab(tab)}!A${startRow}:AZ${endRow}`
      );
      const nonEmpty = rows.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
      if (nonEmpty.length === 0) return Response.json({ synced: 0 });
      const { employees } = mapMasterRows(body.headers, nonEmpty);
      if (employees.length > 0) await upsertEmployees(employees);
      return Response.json({ synced: employees.length });
    }

    // ---- Legacy full sync (small sheets)
    let tabs = null;
    let tab = body?.tab;
    if (!tab) {
      tabs = await getSheetTabs(session.accessToken, spreadsheetId);
      if (tabs.length === 0) {
        return Response.json({ error: "Spreadsheet tidak punya tab." }, { status: 400 });
      }
      tab = tabs[0].title;
    }
    const aoa = await readTabValues(session.accessToken, spreadsheetId, tab);
    const result = await syncMasterAoa(aoa, tab);

    after(() => persistSettingsForUser(session.user.email, {
      master_sheet_url: body?.sheetUrl || body?.spreadsheetId || spreadsheetId,
      master_tab: tab,
    }));

    return Response.json({ ...result, tabs, tab });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
