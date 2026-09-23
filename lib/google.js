import { google } from 'googleapis';

const KOP_MARKS = ["{{kop}}", "{{KOP}}", "{{Kop}}"];
// KOP letterheads are full-width: A4 with 1" margins gives ~451pt of text
// width. Only width is set so height follows the image's aspect ratio.
const KOP_WIDTH_PT = 450;

export function getGoogleClient(accessToken) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return auth;
}

/**
 * Copy a template Google Doc and place it in a target folder
 */
export async function copyTemplate(accessToken, templateId, fileName, folderId) {
  const auth = getGoogleClient(accessToken);
  const drive = google.drive({ version: 'v3', auth });
  
  try {
    const response = await drive.files.copy({
      fileId: templateId,
      requestBody: {
        name: fileName,
        parents: [folderId],
      },
    });
    return response.data.id;
  } catch (error) {
    const details = error?.response?.data?.error || error?.message || error;
    console.error('Google Drive copy error - Status:', error?.response?.status);
    console.error('Google Drive copy error - Details:', JSON.stringify(details, null, 2));
    console.error('Template ID used:', templateId);
    console.error('Folder ID used:', folderId);
    throw new Error(`Failed to copy document template: ${JSON.stringify(details)}`);
  }
}

/**
 * Replace all {{placeholders}} in the copied doc with real values
 */
export async function replacePlaceholders(accessToken, docId, replacements) {
  const auth = getGoogleClient(accessToken);
  const docs = google.docs({ version: 'v1', auth });

  const requests = Object.entries(replacements).map(([key, value]) => ({
    replaceAllText: {
      containsText: {
        text: `{{${key}}}`,
        matchCase: true,
      },
      replaceText: String(value || ''),
    },
  }));

  if (requests.length === 0) return;

  try {
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests,
      },
    });
  } catch (error) {
    console.error('Error replacing placeholders:', error);
    throw new Error('Failed to replace placeholders in document');
  }
}

// The {{kop}} mark can live anywhere: letter body, a (borderless) layout table,
// the page header (where letterheads belong), footers, or another doc tab.
// Walk every segment and map the mark to exact document indices, counting
// non-text elements (images, rules) by their real index length.
function searchParagraph(el, marks) {
  const elements = el.paragraph?.elements || [];
  const runs = []; // { text, start } — text runs with their document index
  let cursor = typeof el.startIndex === "number" ? el.startIndex : null;
  for (const e of elements) {
    if (cursor == null && typeof e.startIndex === "number") cursor = e.startIndex;
    const text = e.textRun?.content;
    const len = text != null
      ? text.length
      : (typeof e.startIndex === "number" && typeof e.endIndex === "number"
          ? e.endIndex - e.startIndex
          : 1);
    if (text && cursor != null) runs.push({ text, start: cursor });
    if (cursor != null) cursor += len;
  }
  const full = runs.map((r) => r.text).join("");
  for (const m of marks) {
    const at = full.indexOf(m);
    if (at < 0) continue;
    // doc index where the mark starts + gaps between runs it spans
    let remaining = at;
    let start = -1;
    let gap = 0;
    let ri = 0;
    for (; ri < runs.length; ri++) {
      const r = runs[ri];
      if (remaining < r.text.length) { start = r.start + remaining; break; }
      remaining -= r.text.length;
    }
    if (start < 0) continue;
    let remEnd = at + m.length;
    let end = -1;
    for (let rj = 0; rj < runs.length; rj++) {
      const r = runs[rj];
      if (rj > ri) gap += r.start - (runs[rj - 1].start + runs[rj - 1].text.length);
      if (remEnd <= r.text.length) { end = r.start + remEnd + gap; break; }
      remEnd -= r.text.length;
    }
    if (end < 0) end = start + m.length + gap;
    return { index: start, endIndex: end };
  }
  return null;
}

function searchContent(content, marks, seg) {
  for (const el of content || []) {
    if (el.paragraph) {
      const hit = searchParagraph(el, marks);
      if (hit) return { ...hit, ...seg };
    } else if (el.table) {
      for (const row of el.table.tableRows || []) {
        for (const cell of row.tableCells || []) {
          const hit = searchContent(cell.content, marks, seg);
          if (hit) return hit;
        }
      }
    } else if (el.tableOfContents) {
      const hit = searchContent(el.tableOfContents.content, marks, seg);
      if (hit) return hit;
    }
  }
  return null;
}

// Every addressable segment: body + all headers/footers (+ first-page
// variants) + every document tab. segmentId/tabId route the edit request
// to the same segment the mark was found in.
function collectSegments(doc) {
  const tabs = (doc.tabs || [])
    .map((t) => ({ tab: t.documentTab, tabId: t.tabProperties?.tabId }))
    .filter((t) => t.tab);
  const sources = tabs.length > 0
    ? tabs
    : [{ tab: doc, tabId: undefined }];
  const segs = [];
  for (const { tab, tabId } of sources) {
    segs.push({ content: tab.body?.content, segmentId: undefined, tabId, label: "badan surat" });
    for (const [id, h] of Object.entries(tab.headers || {})) {
      segs.push({ content: h.content, segmentId: id, tabId, label: "header" });
    }
    for (const [id, f] of Object.entries(tab.footers || {})) {
      segs.push({ content: f.content, segmentId: id, tabId, label: "footer" });
    }
  }
  return segs;
}

function segRef(found) {
  return {
    ...(found.segmentId ? { segmentId: found.segmentId } : {}),
    ...(found.tabId ? { tabId: found.tabId } : {}),
  };
}

async function eraseMark(accessToken, docId, mark) {
  const docs = google.docs({ version: 'v1', auth: getGoogleClient(accessToken) });
  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: [{ replaceAllText: { containsText: { text: mark, matchCase: false }, replaceText: "" } }],
    },
  });
}

// Locate the KOP image for a company code ("KOP LBM.png" etc.) in Drive.
async function findKopImage(accessToken, companyCode) {
  const drive = google.drive({ version: 'v3', auth: getGoogleClient(accessToken) });
  const want = `KOP ${companyCode}`.toUpperCase().replace(/\s+/g, " ").trim();
  const norm = (name) =>
    String(name || "").replace(/\.[a-z0-9]+$/i, "").toUpperCase().replace(/\s+/g, " ").trim();
  const res = await drive.files.list({
    q: `name contains 'KOP ${companyCode}' and mimeType contains 'image/' and trashed = false`,
    fields: "files(id,name,modifiedTime)",
    orderBy: "modifiedTime desc",
    pageSize: 10,
  });
  const files = res.data.files || [];
  // Prefer an exact "KOP <CODE>" name, then any KOP <CODE>... match.
  return files.find((f) => norm(f.name) === want) || files[0] || null;
}

// Docs fetches the image URI itself at insert time, so the Drive file must be
// readable by "anyone with the link". Best-effort; insert may still succeed
// if sharing was already set.
async function ensurePublic(accessToken, fileId) {
  const drive = google.drive({ version: 'v3', auth: getGoogleClient(accessToken) });
  try {
    await drive.permissions.create({
      fileId,
      sendNotificationEmail: false,
      supportsAllDrives: true,
      resource: { role: "reader", type: "anyone", allowFileDiscovery: false },
    });
  } catch {
    // Already public, or not ours to share — the insert attempt will tell.
  }
}

/**
 * Approach B (auto KOP): at the {{kop}} mark of the copied doc, delete the
 * mark and insert the company's KOP image from Drive, sized to text width.
 * Always removes the mark so it can never leak into the document.
 * Returns { inserted, note }.
 */
export async function insertKopImage(accessToken, docId, { companyCode, hasKop }) {
  const docs = google.docs({ version: 'v1', auth: getGoogleClient(accessToken) });
  const got = await docs.documents.get({
    documentId: docId,
    fields: "body(content),headers,footers,tabs(documentTab(body(content),headers,footers),tabProperties)",
    includeTabsContent: true,
  });
  const doc = got.data;
  let found = null;
  for (const seg of collectSegments(doc)) {
    const hit = searchContent(seg.content, KOP_MARKS, seg);
    if (hit) { found = hit; break; }
  }
  if (!found) {
    return {
      inserted: false,
      note: "Tanda {{kop}} tidak ditemukan di template (badan, tabel, maupun header) — tambahkan {{kop}} di baris kop surat agar KOP otomatis terisi.",
    };
  }
  const skip = async (note) => {
    await eraseMark(accessToken, docId, "{{kop}}");
    return { inserted: false, note };
  };
  if (!hasKop || !companyCode) {
    return skip("Lini bisnis ini tanpa KOP — sisipkan gambar KOP secara manual.");
  }

  let image;
  try {
    image = await findKopImage(accessToken, companyCode);
  } catch (e) {
    return skip(`Gagal mencari gambar KOP di Drive: ${e.message}`);
  }
  if (!image) {
    return skip(`Gambar "KOP ${companyCode}" tidak ditemukan di Drive. Buat file bernama KOP ${companyCode}.png`);
  }

  await ensurePublic(accessToken, image.id);
  const uri = `https://drive.google.com/uc?id=${image.id}&export=download`;
  try {
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests: [
          { deleteContentRange: { range: { ...segRef(found), startIndex: found.index, endIndex: found.endIndex } } },
          {
            insertInlineImage: {
              uri,
              location: { ...segRef(found), index: found.index },
              objectSize: { width: { magnitude: KOP_WIDTH_PT, unit: "PT" } },
            },
          },
        ],
      },
    });
    const where = found.label && found.label !== "badan surat" ? ` di ${found.label}` : "";
    return { inserted: true, note: `KOP ${companyCode} (${image.name}) otomatis disisipkan${where}.` };
  } catch (e) {
    const msg = e?.response?.data?.error?.message || e.message;
    return skip(
      `Insert KOP gagal: ${msg}. Pastikan file gambar dibagikan "Siapa saja yang memiliki link" sebagai Pelihat.`
    );
  }
}

/**
 * Get the public URL of the generated doc
 */
export function buildDocUrl(docId) {
  return `https://docs.google.com/document/d/${docId}/edit`;
}
