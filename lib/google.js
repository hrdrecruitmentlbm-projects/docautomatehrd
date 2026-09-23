import { google } from 'googleapis';

// Bumped on every KOP-logic change so Vercel logs prove which build ran.
const KOP_BUILD = "797e8ee-log1";

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
// Whitespace/invisible chars (hand-typed marks often contain NBSP etc.).
const STRIP_ONE = /[\s\u200b-\u200d\ufeff]/;
const STRIP_ALL = /[\s\u200b-\u200d\ufeff]/g;

function normMark(m) {
  return String(m).toLowerCase().replace(STRIP_ALL, "");
}

function searchParagraph(el, marks) {
  const elements = el.paragraph?.elements || [];
  const runs = []; // { text, start } — text runs with their document index
  let cursor = typeof el.startIndex === "number" ? el.startIndex : null;
  let plain = "";
  for (const e of elements) {
    if (cursor == null && typeof e.startIndex === "number") cursor = e.startIndex;
    const text = e.textRun?.content;
    const len = text != null
      ? text.length
      : (typeof e.startIndex === "number" && typeof e.endIndex === "number"
          ? e.endIndex - e.startIndex
          : 1);
    if (text) {
      plain += text;
      if (cursor != null) runs.push({ text, start: cursor });
    }
    if (cursor != null) cursor += len;
  }
  const normMarks = [];
  for (const m of marks) {
    const n = normMark(m);
    if (n && !normMarks.includes(n)) normMarks.push(n);
  }
  // Char map: normalized char -> document index (casefolded, stripped chars
  // skipped; delete range still covers them since they lie inside it).
  const chars = [];
  let norm = "";
  for (const r of runs) {
    for (let i = 0; i < r.text.length; i++) {
      const n = r.text[i].toLowerCase();
      if (STRIP_ONE.test(n)) continue;
      chars.push({ doc: r.start + i });
      norm += n;
    }
  }
  for (const n of normMarks) {
    const at = norm.indexOf(n);
    if (at < 0) continue;
    return { index: chars[at].doc, endIndex: chars[at + n.length - 1].doc + 1 };
  }
  // Text present but position unmappable (indices missing from response)?
  // Report it distinctly instead of a silent miss.
  const plainNorm = plain.toLowerCase().replace(STRIP_ALL, "");
  if (normMarks.some((n) => plainNorm.includes(n))) return { unmapped: true };
  return null;
}

function searchContent(content, marks, seg) {
  let unmapped = null;
  const walk = (list) => {
    for (const el of list || []) {
      if (el.paragraph) {
        const hit = searchParagraph(el, marks);
        if (hit && hit.index != null) return { ...hit, ...seg };
        if (hit && !unmapped) unmapped = seg;
      } else if (el.table) {
        for (const row of el.table.tableRows || []) {
          for (const cell of row.tableCells || []) {
            const hit = walk(cell.content);
            if (hit) return hit;
          }
        }
      } else if (el.tableOfContents) {
        const hit = walk(el.tableOfContents.content);
        if (hit) return hit;
      }
    }
    return null;
  };
  return walk(content) || (unmapped ? { unmapped: true, ...unmapped } : null);
}

// First N chars of visible text in a segment (for miss-path diagnostics).
function snippet(content, n = 200) {
  let out = "";
  const walk = (list) => {
    for (const el of list || []) {
      if (out.length >= n) return;
      if (el.paragraph) {
        for (const e of el.paragraph.elements || []) {
          if (e.textRun?.content) out += e.textRun.content;
          if (out.length >= n) return;
        }
      } else if (el.table) {
        for (const row of el.table.tableRows || []) {
          for (const cell of row.tableCells || []) walk(cell.content);
        }
      } else if (el.tableOfContents) {
        walk(el.tableOfContents.content);
      }
    }
  };
  walk(content);
  return out.slice(0, n).replace(/\s+/g, " ");
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
  // NOTE: legacy top-level fields (body/headers/footers) may NOT be combined
  // with includeTabsContent — the API rejects the call. Tabs-only mask covers
  // tabbed and non-tabbed documents alike (tabs[] always has ≥1 entry).
  // NOTE 2: no `fields` restriction here on purpose. A restrictive mask
  // demonstrably strips startIndex/endIndex from header elements (Vercel log:
  // header kix.hf0 arrived with 1 paragraph, text matched, zero indices),
  // which makes the mark unmappable. Full fetch carries the indices.
  const got = await docs.documents.get({
    documentId: docId,
    includeTabsContent: true,
  });
  const doc = got.data;
  const segs = collectSegments(doc);
  // Diagnostics: what did the fetch actually return? (Vercel logs.)
  try {
    console.log(`[kop ${KOP_BUILD}] segments:`, JSON.stringify(segs.map((s) => ({
      label: s.label,
      segmentId: s.segmentId || "(body)",
      paragraphs: (s.content || []).length,
    }))));
    // Decisive sample: does the header element carry indices at all?
    const hSeg = segs.find((s) => s.label === "header");
    const hEl = hSeg?.content?.[0];
    const hChild = hEl?.paragraph?.elements?.[0];
    console.log(`[kop ${KOP_BUILD}] headerEl:`, JSON.stringify({
      elKeys: hEl ? Object.keys(hEl) : null,
      elStart: hEl?.startIndex ?? null,
      childKeys: hChild ? Object.keys(hChild) : null,
      childStart: hChild?.startIndex ?? null,
      childHasText: !!hChild?.textRun?.content,
    }));
  } catch { /* logging must never break generation */ }
  let found = null;
  let unmappedSeg = null;
  for (const seg of segs) {
    const hit = searchContent(seg.content, KOP_MARKS, seg);
    if (hit && hit.index != null) { found = hit; break; }
    if (hit && !unmappedSeg) unmappedSeg = hit;
  }
  if (unmappedSeg && !found) {
    return {
      inserted: false,
      note: `Tanda {{kop}} terlihat di ${unmappedSeg.label || "template"} tapi posisinya tidak terbaca (indeks dokumen hilang dari respons API).`,
    };
  }
  if (!found) {
    const summary = segs.map((s) => `${s.label || "segmen"}(${(s.content || []).length})`).join(", ");
    try {
      for (const s of segs) {
        console.log(`[kop] snippet ${s.label}:`, JSON.stringify(snippet(s.content)));
      }
    } catch { /* logging must never break generation */ }
    return {
      inserted: false,
      note: `Tanda {{kop}} tidak ditemukan di template — terpindai: ${summary || "kosong"}. Pastikan {{kop}} diketik sebagai teks biasa (bukan di kotak teks/gambar).`,
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
