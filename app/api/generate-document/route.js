import { auth } from "@/auth";
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { getDocumentConfig } from "@/lib/document-configs";
import { copyTemplate, replacePlaceholders, buildDocUrl, insertKopImage } from "@/lib/google";
import { generateDocumentNumber } from "@/lib/auto-numbering";
import { getOrCreateFolder } from "@/lib/drive-folders";
import { resolveCompany, buildPkwtReplacements, addMonths, formatTanggalId, formatMonthYearId } from "@/lib/pkwt";

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

    // ---- Cabang PKWT OTOMATIS: cari nama -> data + payroll terisi sendiri ----
    if (documentType === 'pkwt' && employeeKey) {
      return handlePkwtAuto({ session, settings, employeeKey, manual });
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

async function handlePkwtAuto({ session, settings, employeeKey, manual = {} }) {
  const key = String(employeeKey || "").toLowerCase().trim();
  if (!key) return Response.json({ error: "employeeKey wajib diisi" }, { status: 400 });

  const { data: employee, error: empError } = await supabaseAdmin
    .from("employees")
    .select("*")
    .eq("nama_key", key)
    .single();
  if (empError || !employee) {
    return Response.json({ error: "Karyawan tidak ditemukan di database. Impor master dulu di halaman Data." }, { status: 404 });
  }

  const { data: payroll } = await supabaseAdmin
    .from("payroll_latest")
    .select("*")
    .eq("nama_key", key)
    .single();

  const liniBisnis = employee.lini_bisnis || "";
  const { data: mapping } = await supabaseAdmin
    .from("company_map")
    .select("*")
    .eq("lini_bisnis", liniBisnis.toUpperCase().trim())
    .single();
  const { data: fallbackMap } = await supabaseAdmin
    .from("company_map")
    .select("*")
    .eq("lini_bisnis", "__FALLBACK__")
    .single();

  const resolved = resolveCompany(liniBisnis);
  const mappedCode = mapping?.company_code || null;
  const hasKop = !!mappedCode || resolved.hasKop;
  const companyCode = mappedCode || resolved.companyCode;
  // Penomoran: pakai kode KOP bila ada, sonst nama lini bisnis mentah (cth: HRD-SAHAM).
  const numberingCode = hasKop ? companyCode : (liniBisnis || "UMUM");

  // Template: per-perusahaan bila ada KOP, sonst fallback generik (tanpa KOP).
  const templateId = hasKop
    ? (mapping?.pkwt_template_id || fallbackMap?.pkwt_template_id || settings?.pkwt_template_id)
    : (fallbackMap?.pkwt_template_id || settings?.pkwt_template_id);
  const folderId = hasKop
    ? (mapping?.pkwt_folder_id || fallbackMap?.pkwt_folder_id || settings?.pkwt_folder_id)
    : (fallbackMap?.pkwt_folder_id || settings?.pkwt_folder_id);

  if (!templateId || !folderId) {
    return Response.json({
      error: hasKop
        ? `Template PKWT untuk ${companyCode} belum dikonfigurasi. Isi di halaman Data > Pemetaan Perusahaan (atau Settings sebagai fallback).`
        : "Template generik (tanpa KOP) belum dikonfigurasi. Isi fallback di halaman Data > Pemetaan Perusahaan baris __FALLBACK__ (atau Settings).",
    }, { status: 400 });
  }

  // Input manual yang tersisa: tanggal_mulai, periode/jangka, tanggal_ttd.
  const tanggalMulaiRaw = manual.tanggal_mulai;
  if (!tanggalMulaiRaw) {
    return Response.json({ error: "tanggal_mulai wajib diisi" }, { status: 400 });
  }
  const jangkaBulan = parseInt(manual.jangka_bulan || manual.jangka_waktu || "0", 10) || 0;
  let tanggalBerakhirRaw = manual.tanggal_berakhir;
  if (!tanggalBerakhirRaw && jangkaBulan > 0) {
    tanggalBerakhirRaw = addMonths(new Date(tanggalMulaiRaw), jangkaBulan).toISOString().slice(0, 10);
  }
  const periodeKontrak = manual.periode_kontrak
    || (jangkaBulan > 0 ? `${jangkaBulan} Bulan` : "");
  const tanggalTtdRaw = manual.tanggal_ttd || new Date().toISOString().slice(0, 10);

  const documentNumber = await generateDocumentNumber("pkwt", numberingCode);
  const sequenceNumber = parseInt(documentNumber.split("/")[0], 10);

  const replacements = buildPkwtReplacements({
    employee,
    payroll: payroll || {},
    manual: {
      tanggal_mulai: tanggalMulaiRaw,
      tanggal_berakhir: tanggalBerakhirRaw || "",
      periode_kontrak: periodeKontrak,
      tanggal_ttd: tanggalTtdRaw,
    },
    documentNumber,
    companyLegal: mapping?.legal_name || companyCode,
  });
  // Pihak Pertama selalu hardcode di template (Dena Kurniawan) — tidak dioverride.

  const displayName = employee.nama_asli || "Document";
  const fileName = `${documentNumber.replace(/\//g, "_")} - ${displayName}`;

  // ---- Arsip PKWT: HRIS PKWT/<Bulan Tahun>/<KODE PERUSAHAAN> ----
  // Bulan = tanggal pembuatan (sama dengan dasar nomor surat).
  // Kode = company_code dari /data (company_map); baris tanpa KOP memakai
  // lini_bisnis mentah -> selalu sama dengan segmen HRD-XXX di nomor surat.
  // Gagal menyiapkan arsip TIDAK boleh membatalkan dokumen: fallback ke
  // folder root dengan catatan di respons.
  let targetFolderId = folderId;
  let folderPath = null;
  let folderNote = "";
  try {
    const monthFolder = formatMonthYearId(new Date());
    const divisionFolder = String(numberingCode || "UMUM").toUpperCase();
    const memo = new Map();
    const monthFolderId = await getOrCreateFolder(session.accessToken, folderId, monthFolder, memo);
    targetFolderId = await getOrCreateFolder(session.accessToken, monthFolderId, divisionFolder, memo);
    folderPath = `${monthFolder}/${divisionFolder}`;
  } catch (e) {
    console.error("Archive folder resolution failed, falling back to root folder:", e);
    targetFolderId = folderId;
    folderPath = null;
    folderNote = `Folder arsip gagal dibuat (${e.message}) — dokumen disimpan di folder root.`;
  }

  const docId = await copyTemplate(session.accessToken, templateId, fileName, targetFolderId);
  await replacePlaceholders(session.accessToken, docId, replacements);

  // KOP otomatis: sisipkan gambar perusahaan di tanda {{kop}}, lalu hapus tanda.
  let kop = { inserted: false, note: "" };
  try {
    kop = await insertKopImage(session.accessToken, docId, {
      companyCode: hasKop ? companyCode : "",
      hasKop,
    });
  } catch (e) {
    kop = { inserted: false, note: `KOP gagal diproses: ${e.message}` };
  }

  const docUrl = buildDocUrl(docId);

  const formSnapshot = {
    source: "pkwt-auto",
    employee_nama_key: key,
    tanggal_mulai: formatTanggalId(tanggalMulaiRaw),
    tanggal_berakhir: formatTanggalId(tanggalBerakhirRaw),
    periode_kontrak: periodeKontrak,
    tanggal_ttd: formatTanggalId(tanggalTtdRaw),
    payroll_periode: payroll?.periode_bulan || null,
    employee,
    payroll: payroll || null,
  };

  // Insert log: coba dengan kolom audit baru, fallback ke skema lama bila migrasi belum jalan.
  const baseRow = {
    user_email: session.user.email,
    document_type: "pkwt",
    document_number: documentNumber,
    sequence_number: sequenceNumber,
    company_code: numberingCode,
    employee_name: displayName,
    google_doc_id: docId,
    google_doc_url: docUrl,
    form_data: formSnapshot,
  };
  let logError = null;
  const withAudit = await supabaseAdmin.from("document_logs").insert({
    ...baseRow,
    employee_nama_key: key,
    lini_bisnis: liniBisnis,
    periode_bulan: payroll?.periode_bulan || null,
    folder_id: targetFolderId,
    folder_path: folderPath,
  });
  if (withAudit.error && /column/i.test(withAudit.error.message || "")) {
    const retry = await supabaseAdmin.from("document_logs").insert(baseRow);
    logError = retry.error;
  } else {
    logError = withAudit.error;
  }
  if (logError) console.error("Failed to log PKWT generation:", logError);

  return Response.json({
    success: true,
    docUrl,
    docId,
    documentNumber,
    companyCode: numberingCode,
    folderPath,
    folderId: targetFolderId,
    folderNote,
    hasKop,
    needsManualKop: !hasKop,
    kopInserted: kop.inserted,
    kopNote: kop.note,
  });
}
