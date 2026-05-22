import { auth } from "@/auth";
import { supabase } from "@/lib/supabase";
import { getDocumentConfig } from "@/lib/document-configs";
import { copyTemplate, replacePlaceholders, buildDocUrl } from "@/lib/google";
import { generateDocumentNumber } from "@/lib/auto-numbering";

export async function POST(req) {
  try {
    const session = await auth();
    if (!session || !session.user || !session.accessToken) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { documentType, companyCode, formData } = body;

    if (!documentType || !companyCode || !formData) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    const config = getDocumentConfig(documentType);
    if (!config) {
      return Response.json({ error: "Invalid document type" }, { status: 400 });
    }

    // 1. Load user settings
    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('*')
      .eq('user_email', session.user.email)
      .single();

    if (settingsError && settingsError.code !== 'PGRST116') {
      console.error("Settings error", settingsError);
      return Response.json({ error: "Failed to load user settings" }, { status: 500 });
    }

    const templateId = settings?.[`${documentType}_template_id`];
    const folderId = settings?.[`${documentType}_folder_id`];

    if (!templateId || !folderId) {
      return Response.json({ error: `Please configure Template ID and Folder ID for ${config.label} in Settings.` }, { status: 400 });
    }

    // 2. Generate Number
    const documentNumber = await generateDocumentNumber(documentType, companyCode);
    const sequenceNumber = parseInt(documentNumber.split('/')[0], 10);

    // 3. Compute derived fields
    const replacements = { ...formData };
    replacements.nomor_surat = documentNumber; // commonly used
    replacements.nomor_sk = documentNumber;
    replacements.nomor_memo = documentNumber;
    replacements.nomor_sp = documentNumber;
    replacements.nama_penandatangan = settings?.signatory_name || '';
    replacements.jabatan_penandatangan = settings?.signatory_title || '';
    
    // Add computed dates if PKWT
    if (documentType === 'pkwt' && formData.tanggal_mulai && formData.lama_kontrak) {
      const startDate = new Date(formData.tanggal_mulai);
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + parseInt(formData.lama_kontrak));
      
      const options = { year: 'numeric', month: 'long', day: 'numeric' };
      replacements.tanggal_selesai = endDate.toLocaleDateString('id-ID', options);
    }
    
    // Format current date
    const today = new Date();
    replacements.tanggal_surat = today.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });

    // 4. Google Docs API Operations
    const fileName = `${documentNumber.replace(/\//g, '_')} - ${formData.nama_karyawan || 'Document'}`;
    const docId = await copyTemplate(session.accessToken, templateId, fileName, folderId);
    
    await replacePlaceholders(session.accessToken, docId, replacements);
    
    const docUrl = buildDocUrl(docId);

    // 5. Log to Supabase
    const { error: logError } = await supabase
      .from('document_logs')
      .insert({
        user_email: session.user.email,
        document_type: documentType,
        document_number: documentNumber,
        sequence_number: sequenceNumber,
        company_code: companyCode,
        employee_name: formData.nama_karyawan || formData.kepada || null,
        google_doc_id: docId,
        google_doc_url: docUrl,
        form_data: formData
      });

    if (logError) {
      console.error("Failed to log document generation:", logError);
    }

    return Response.json({ success: true, docUrl, docId });

  } catch (error) {
    console.error("API Error:", error);
    return Response.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}
