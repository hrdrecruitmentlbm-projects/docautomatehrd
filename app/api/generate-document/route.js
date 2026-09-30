import { auth } from "@/auth";
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { getDocumentConfig } from "@/lib/document-configs";
import { copyTemplate, replacePlaceholders, buildDocUrl } from "@/lib/google";
import { generateDocumentNumber } from "@/lib/auto-numbering";
import { generatePkwt } from "@/lib/generate-pkwt";
import { generatePaklaring } from "@/lib/generate-paklaring";

// WAJIB: rantai ini memanggil Google Docs API beberapa kali — copy template,
// batchUpdate penanda, insert gambar KOP, docs.get untuk pemeriksaan hasil,
// lalu insert log. Semua query Google, tidak ada yang bisa dilewati.
// Tanpa deklarasi ini Vercel Hobby memakai default 10 detik, dan fungsi
// mati di tengah: dokumen bisa sudah ada di Drive sedangkan log belum —
// pengguna lihat "Unexpected end of JSON input" dan berpikir gagal padahal
// dokumennya tercipta. Route Google berat lain di repo ini sudah 60 detik
// (sync-master, sync-payroll, diagnose, template-audit, backfill).
export const maxDuration = 60;

export async function POST(req) {
  try {
    const session = await auth();
    if (!session || !session.user || !session.accessToken) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { documentType, companyCode, formData, employeeKey, manual } = body;

    if (!documentType) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    const config = getDocumentConfig(documentType);
    if (!config) {
      return Response.json({ error: "Invalid document type" }, { status: 400 });
    }

    // 1. Load user settings (template & folder fallback generik)
    const { data: settings, error: settingsError } = await supabase
      .from('settings')
      .select('*')
      .eq('user_email', session.user.email)
      .single();

    if (settingsError && settingsError.code !== 'PGRST116') {
      console.error("Settings error", settingsError);
      return Response.json({ error: "Failed to load user settings" }, { status: 500 });
    }

    // ---- Cabang otomatis: cari nama -> data terisi sendiri ----
    // PKWT butuh payroll, Paklaring tidak. Keduanya punya generator sendiri;
    // yang di sini hanya memilih jalurnya.
    if (documentType === 'pkwt' && employeeKey) {
      return handleAutoDoc(handlePkwtAuto, { session, settings, employeeKey, manual });
    }
    if (documentType === 'paklaring' && employeeKey) {
      return handleAutoDoc(handlePaklaringAuto, { session, settings, employeeKey, manual });
    }

    // ---- Alur lama (SK/Memo/SP + fallback PKWT manual) ----
    if (!companyCode || !formData) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
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

    return Response.json({ success: true, docUrl, docId, documentNumber });
  } catch (error) {
    console.error("API Error:", error);
    return Response.json({ error: error.message || "Internal Server Error" }, { status: 500 });
  }
}

/**
 * PKWT otomatis. Logikanya hidup di lib/generate-pkwt.js supaya
 * "Buat Salinan" memakai jalur yang persis sama — bukan salinan kode
 * yang bisa melenceng diam-diam.
 */
async function handlePkwtAuto({ session, settings, employeeKey, manual = {} }) {
  return handleAutoDoc(generatePkwt, { session, settings, employeeKey, manual });
}

/**
 * Paklaring otomatis. Logikanya hidup di lib/generate-paklaring.js.
 */
async function handlePaklaringAuto({ session, settings, employeeKey, manual = {} }) {
  return handleAutoDoc(generatePaklaring, { session, settings, employeeKey, manual });
}

/**
 * Bentuk respons generik untuk generator otomatis.
 *
 * Generator SANGGUP melempar: copyTemplate() dan replacePlaceholders() berbuat
 * itu sengaja, dengan pesan yang memuat ID template, ID folder, dan detail
 * respons Google. Pesan itu adalah satu-satunya cara mengeluh di produksi.
 *
 * `.catch()` di sini WAJIB, bukan sekadar rapih. Tanpanya:
 *   return handleAutoDoc(...)   <- return promise dari dalam try
 * tidak pernah memicu catch di POST (try/catch hanya menangkap throw sinkron).
 * Penolakan lolos ke Next.js, yang membalas body tanpa kunci `error`, dan
 * pengguna melihat "Terjadi kesalahan" tanpa petunjuk apa pun — persis yang
 * terjadi pada percobaan Paklaring pertama.
 *
 * Menangkap SEMUA penolakan berarti setiap kegagalan tiba di UI sebagai
 * JSON {error} dengan status yang benar, termasuk untuk PKWT.
 */
function handleAutoDoc(generate, args) {
  return Promise.resolve()
    .then(() => generate(args))
    .then((result) => {
      if (!result.ok) {
        return Response.json({ error: result.error }, { status: result.status });
      }
      const { ok, ...payload } = result;
      return Response.json(payload);
    })
    .catch((error) => {
      console.error("Auto document generation threw:", error);
      return Response.json(
        {
          error:
            error?.message ||
            "Terjadi kesalahan saat membuat dokumen. Periksa Vercel → Logs.",
        },
        { status: 500 }
      );
    });
}
