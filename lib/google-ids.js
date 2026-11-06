// Client-safe and server-safe utilities for extracting and validating Google Drive / Sheets IDs.
// Does NOT import googleapis, xlsx, or node built-ins.

function cleanIdFragment(s) {
  return String(s || "").split(/[?#]/)[0].split("/")[0].trim();
}

const ID_RE = /^[a-zA-Z0-9-_]{10,}$/;

export function extractSpreadsheetId(input) {
  const s = String(input || "").trim();
  if (!s) return "";
  let m = s.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  m = s.match(/\/d\/([a-zA-Z0-9-_]{10,})/);
  if (m) return m[1];
  const cleaned = cleanIdFragment(s);
  return ID_RE.test(cleaned) ? cleaned : "";
}

export function extractFolderId(input) {
  const s = String(input || "").trim();
  if (!s) return "";
  const m = s.match(/folders\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  const cleaned = cleanIdFragment(s);
  return ID_RE.test(cleaned) ? cleaned : "";
}

export function extractFileId(input) {
  const s = String(input || "").trim();
  if (!s) return "";
  let m = s.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  m = s.match(/[?&]id=([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  m = s.match(/drive\/(?:file\/d\/|open\?id=)([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  m = s.match(/\/d\/([a-zA-Z0-9-_]{10,})/);
  if (m) return m[1];
  const cleaned = cleanIdFragment(s);
  return ID_RE.test(cleaned) ? cleaned : "";
}

export function isValidGoogleId(id) {
  return ID_RE.test(String(id || ""));
}
