import { google } from 'googleapis';

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

/**
 * Get the public URL of the generated doc
 */
export function buildDocUrl(docId) {
  return `https://docs.google.com/document/d/${docId}/edit`;
}
