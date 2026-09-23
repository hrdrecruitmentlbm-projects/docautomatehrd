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

// Find the {{kop}} mark's absolute index in the body by walking paragraphs.
function findMark(content, marks) {
  let pos = 1;
  for (const el of content || []) {
    const start = typeof el.startIndex === "number" ? el.startIndex : pos;
    const elements = el.paragraph?.elements;
    if (elements) {
      let text = "";
      for (const e of elements) if (e.textRun?.content) text += e.textRun.content;
      for (const m of marks) {
        const at = text.indexOf(m);
        if (at >= 0) return { index: start + at, length: m.length };
      }
      pos = start + text.length;
    }
  }
  return null;
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
  const got = await docs.documents.get({ documentId: docId, fields: "body(content)" });
  const found = findMark(got.data.body?.content, KOP_MARKS);
  if (!found) {
    return {
      inserted: false,
      note: "Tanda {{kop}} tidak ada di template — tambahkan {{kop}} di baris kop surat agar KOP otomatis terisi.",
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
          { deleteContentRange: { range: { startIndex: found.index, endIndex: found.index + found.length } } },
          {
            insertInlineImage: {
              uri,
              location: { index: found.index },
              objectSize: { width: { magnitude: KOP_WIDTH_PT, unit: "PT" } },
            },
          },
        ],
      },
    });
    return { inserted: true, note: `KOP ${companyCode} (${image.name}) otomatis disisipkan.` };
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
