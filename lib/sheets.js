import { google } from "googleapis";
import * as XLSX from "xlsx";

export function getSheetsClient(accessToken) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.sheets({ version: "v4", auth });
}

export function getDriveClient(accessToken) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.drive({ version: "v3", auth });
}

export function extractSpreadsheetId(input) {
  const s = String(input || "").trim();
  if (!s) return "";
  const m = s.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : s;
}

export function extractFolderId(input) {
  const s = String(input || "").trim();
  if (!s) return "";
  const m = s.match(/folders\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : s;
}

export function extractFileId(input) {
  const s = String(input || "").trim();
  if (!s) return "";
  let m = s.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  m = s.match(/[?&]id=([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  m = s.match(/drive\/(?:file\/d\/|open\?id=)([a-zA-Z0-9-_]+)/);
  return m ? m[1] : s;
}

function friendlyGoogleError(error, kind) {
  const code = error?.code;
  const msg = error?.message || String(error);
  if (code === 404) {
    return `${kind} tidak ditemukan atau belum dibagikan ke akun Google Anda.`;
  }
  if (code === 403) {
    return `Akses ditolak. Pastikan Google Sheets API aktif dan ${kind.toLowerCase()} dibagikan ke akun Anda (Viewer cukup).`;
  }
  if (code === 401) {
    return "Sesi Google kedaluwarsa. Keluar lalu masuk kembali.";
  }
  return msg;
}

export async function getSheetTabs(accessToken, spreadsheetId) {
  const sheets = getSheetsClient(accessToken);
  try {
    const res = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties.title",
    });
    return (res.data.sheets || []).map((s) => s.properties?.title).filter(Boolean);
  } catch (error) {
    throw new Error(friendlyGoogleError(error, "Spreadsheet"));
  }
}

export async function readTabValues(accessToken, spreadsheetId, tabTitle) {
  const sheets = getSheetsClient(accessToken);
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: tabTitle,
    });
    return (res.data.values || []).map((row) => row.map((c) => String(c ?? "")));
  } catch (error) {
    throw new Error(friendlyGoogleError(error, "Tab spreadsheet"));
  }
}

const SHEET_MIMES = new Set([
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
]);

export async function listSpreadsheetFiles(accessToken, folderId) {
  const drive = getDriveClient(accessToken);
  try {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "files(id, name, mimeType, modifiedTime)",
      orderBy: "modifiedTime desc",
      pageSize: 50,
    });
    return (res.data.files || []).filter((f) => SHEET_MIMES.has(f.mimeType));
  } catch (error) {
    throw new Error(friendlyGoogleError(error, "Folder Drive"));
  }
}

export function extractPeriode(fileName, fallbackISODate) {
  const m = String(fileName || "").match(/(20\d{2})[^0-9]?(\d{1,2})/);
  if (m) {
    const month = parseInt(m[2], 10);
    if (month >= 1 && month <= 12) {
      return `${m[1]}-${String(month).padStart(2, "0")}`;
    }
  }
  const d = (fallbackISODate || "").slice(0, 7);
  return /^\d{4}-\d{2}$/.test(d) ? d : "";
}

export function pickNewestFile(files) {
  if (!files || files.length === 0) return null;
  const scored = files.map((f) => ({
    file: f,
    periode: extractPeriode(f.name, f.modifiedTime),
  }));
  scored.sort((a, b) => {
    if (a.periode && b.periode) return b.periode.localeCompare(a.periode);
    if (a.periode) return -1;
    if (b.periode) return 1;
    return String(b.file.modifiedTime).localeCompare(String(a.file.modifiedTime));
  });
  return scored[0];
}

// Read any Drive file (native Google Sheet tab or uploaded .xlsx/.csv) as array-of-arrays.
export async function readDriveFileAsAoa(accessToken, file, tabTitle) {
  if (file.mimeType === "application/vnd.google-apps.spreadsheet") {
    const tabs = await getSheetTabs(accessToken, file.id);
    const tab = tabTitle || tabs[0];
    if (!tab) throw new Error("Spreadsheet tidak punya tab.");
    const values = await readTabValues(accessToken, file.id, tab);
    return { aoa: values, tab };
  }
  const drive = getDriveClient(accessToken);
  try {
    const res = await drive.files.get({ fileId: file.id, alt: "media" }, { responseType: "arraybuffer" });
    const buf = Buffer.from(res.data);
    const wb = XLSX.read(buf, { type: "buffer" });
    const sheetName = wb.SheetNames[0];
    const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: "" });
    return { aoa, tab: sheetName };
  } catch (error) {
    throw new Error(friendlyGoogleError(error, "File"));
  }
}
