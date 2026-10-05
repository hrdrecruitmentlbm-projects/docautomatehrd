import { supabaseAdmin } from "./supabase";
import { copyTemplate, replacePlaceholders, buildDocUrl, insertKopImage, insertSignatureImage } from "./google";
import { generateDocumentNumber } from "./auto-numbering";
import { resolveCompanyConfig, resolveArchiveFolder, finalizeDocument } from "./contract-common";
import { buildPaklaringReplacements, paklaringBlankFields } from "./paklaring";
import { formatMonthYearId, formatTanggalId } from "./pkwt";
import { buildDocumentFileName } from "./file-name";

/** Subfolder arsip Paklaring di bawah root HRIS PKWT. */
const PAKLARING_FOLDER = "Paklaring";

/**
 * Satu-satunya jalur pembuatan Paklaring (Surat Keterangan Kerja).
 *
 * Sibling dari lib/generate-pkwt.js, bukan salinannya. Yang sama:
 *   company resolution -> template/folder -> nomor -> salin template ->
 *   ganti penanda -> KOP -> TTD -> verifikasi -> catat.
 * Yang TIDAK ada di sini, dan itu disengaja:
 *   - tidak ada query payroll. Surat keterangan kerja tidak memuat gaji, dan
 *     guard "payroll kosong" milik PKWT tidak punya padanan yang jujur.
 *   - tidak ada jangka waktu / tanggal berakhir. Masa kerja karyawan sudah
 *     selesai saat surat ini terbit, jadi tidak ada yang perlu dihitung.
 *
 * Kontrak nilai balik sama persis dengan generatePkwt():
 *   gagal  -> { ok: false, status, error }
 *   sukses -> { ok: true, ...payload }
 * Tidak pernah melempar error: pemanggil yang membungkus jadi Response.
 */
export async function generatePaklaring({ session, settings, employeeKey, manual = {} }) {
  const key = String(employeeKey || "").toLowerCase().trim();
  if (!key) return { ok: false, status: 400, error: "employeeKey wajib diisi" };

  const { data: employee, error: empError } = await supabaseAdmin
    .from("employees")
    .select("*")
    .eq("nama_key", key)
    .single();
  if (empError || !employee) {
    return {
      ok: false,
      status: 404,
      error: "Karyawan tidak ditemukan di database. Impor master dulu di halaman Data.",
    };
  }

  // Folder root Paklaring = folder root PKWT ("HRIS PKWT"), jadi
  // pkwt_folder_id adalah fallback yang benar. Lihat supabase/paklaring.sql
  // untuk alasannya tidak ada kolom folder per perusahaan.
  const company = await resolveCompanyConfig({
    employee,
    settings,
    templateColumns: ["paklaring_template_id"],
    folderColumns: ["paklaring_folder_id", "pkwt_folder_id"],
  });

  if (!company.templateId || !company.folderId) {
    return {
      ok: false,
      status: 400,
      error: company.hasKop
        ? `Template Paklaring untuk ${company.companyCode} belum dikonfigurasi. Isi di halaman Data > Pemetaan Perusahaan (kolom Template ID Paklaring).`
        : 'Template generik Paklaring (tanpa KOP) belum dikonfigurasi. Isi fallback di halaman Data > Pemetaan Perusahaan baris __FALLBACK__ (atau Settings).',
    };
  }

  // ---- Input manual: satu tanggal ----
  // {{today}} dipakai di DUA tempat: "sampai {{today}}" di badan surat dan
  // "Purwokerto, {{today}}" di blok tanda tangan. Keduanya harus nilai yang
  // sama, jadi cukup satu field. Default-nya hari ini (dikonfirmasi form).
  //
  // TIDAK ada default diam: kalau tanggal kosong, surat akan berbunyi
  // "telah bekerja dari tanggal X sampai " — kalimat yang tidak lengkap pada
  // dokumen hukum. Hentikan di sini, sama seperti PKWT menghentikan payroll
  // kosong daripada menerbitkan kontrak dengan Gapok Rp 0,-.
  const tanggalKeluarRaw = manual.tanggal_keluar || manual.today || "";
  if (!tanggalKeluarRaw) {
    return {
      ok: false,
      status: 400,
      error: "Tanggal keluar wajib diisi — dipakai untuk {{today}} di badan surat dan di blok tanda tangan.",
    };
  }

  // Tanggal masuk dari master, bukan dari log kontrak. Kalau kosong, kalimat
  // "telah bekerja dari tanggal ... sampai ..." kehilangan salah satu ujungnya.
  if (!String(employee.tanggal_masuk || "").trim()) {
    return {
      ok: false,
      status: 422,
      error:
        `Tanggal masuk ${employee.nama_asli} kosong di master, jadi periode bekerja tidak bisa diisi. ` +
        "Lengkapi kolom tanggal masuk di sheet master lalu sync ulang di halaman Data. " +
        "Surat tidak dibuat untuk mencegah kalimat yang tidak lengkap.",
    };
  }

  const documentNumber = await generateDocumentNumber("paklaring", company.numberingCode);
  const sequenceNumber = parseInt(documentNumber.split("/")[0], 10);

  const replacements = buildPaklaringReplacements({
    employee,
    manual: { tanggal_keluar: tanggalKeluarRaw },
    documentNumber,
    companyLegal: company.legalName,
  });

  const displayName = employee.nama_asli || "Document";
  // Nama berkas = nomor surat utuh + "_" + nama. Lihat lib/file-name.js.
  const fileName = buildDocumentFileName(documentNumber, employee.nama_asli);

  // ---- Arsip: HRIS PKWT / Paklaring / <Bulan Tahun> ----
  // Bulan = tanggal KELUAR, bukan tanggal pembuatan. Satu-satunya sumbu
  // folder di sini, dan yang ditanyakan orang saat membuka folder Paklaring
  // adalah "siapa yang keluar bulan ini" — bukan "dokumen apa yang diketik
  // bulan ini". Nilai yang sama juga tercetak di surat, jadi folder tidak
  // mungkin bertentangan dengan dokumennya.
  const archive = await resolveArchiveFolder({
    accessToken: session.accessToken,
    rootFolderId: company.folderId,
    segments: [PAKLARING_FOLDER, formatMonthYearId(tanggalKeluarRaw)],
  });

  const docId = await copyTemplate(session.accessToken, company.templateId, fileName, archive.folderId);
  await replacePlaceholders(session.accessToken, docId, replacements);

  // KOP: kop perusahaan di {{kop}}.
  let kop = { inserted: false, note: "" };
  try {
    kop = await insertKopImage(session.accessToken, docId, {
      companyCode: company.hasKop ? company.companyCode : "",
      hasKop: company.hasKop,
    });
  } catch (e) {
    kop = { inserted: false, note: `KOP gagal diproses: ${e.message}` };
  }

  // TTD: tanda tangan + stempel per perusahaan di {{ttd}}. Nama orangnya
  // sama untuk semua perusahaan, tapi stempelnya berbeda — jadi gambarnya
  // dipilih dari company_code, bukan dari input pengguna.
  let ttd = { inserted: false, note: "" };
  try {
    ttd = await insertSignatureImage(session.accessToken, docId, {
      companyCode: company.hasKop ? company.companyCode : "",
      hasKop: company.hasKop,
    });
  } catch (e) {
    ttd = { inserted: false, note: `Tanda tangan gagal diproses: ${e.message}` };
  }

  // Dua pemeriksaan yang saling menutup, keduanya hanya memberi tahu:
  //   unfilled -> penanda {{…}} yang masih tertinggal (salah eja / tidak dikirim)
  //   kosong   -> penanda yang TERISI dengan string kosong (nilainya tidak ada)
  // Yang kedua tidak tertangkap oleh verifyDocument: penandanya hilang bersih
  // dan dokumen terlihat rapi, padahal kalimatnya tidak lengkap.
  const kosong = paklaringBlankFields(employee);
  const final = await finalizeDocument({
    accessToken: session.accessToken,
    docId,
    docType: "paklaring",
    // baseRow HANYA kolom yang dijamin ada di skema asli (lihat
    // DocAutomations.md). Semua kolom lifecycle/arsip harus di optionalColumns
    // — kalau diletakkan di sini, retry "kolom belum ada" akan gagal dengan
    // kolom yang sama persis dan log pun tetap hilang.
    baseRow: {
      user_email: session.user.email,
      document_type: "paklaring",
      document_number: documentNumber,
      sequence_number: sequenceNumber,
      company_code: company.numberingCode,
      employee_name: displayName,
      google_doc_id: docId,
      google_doc_url: buildDocUrl(docId),
      form_data: {
        source: "paklaring-auto",
        employee_nama_key: key,
        tanggal_keluar: formatTanggalId(tanggalKeluarRaw),
        employee,
      },
    },
    optionalColumns: {
      employee_nama_key: key,
      lini_bisnis: company.liniBisnis,
      tanggal_keluar: tanggalKeluarRaw,
      folder_id: archive.folderId,
      folder_path: archive.path,
    },
  });

  if (final.logError) console.error("Failed to log Paklaring generation:", final.logError);

  return {
    ok: true,
    success: true,
    docUrl: buildDocUrl(docId),
    docId,
    documentNumber,
    companyCode: company.numberingCode,
    folderPath: archive.path,
    folderId: archive.folderId,
    folderNote: archive.note,
    hasKop: company.hasKop,
    needsManualKop: !company.hasKop,
    kopInserted: kop.inserted,
    kopNote: kop.note,
    ttdInserted: ttd.inserted,
    ttdNote: ttd.note,
    // Nama & jabatan penandatangan sudah hardcode di template, jadi TTD yang
    // gagal bukan dokumen rusak — cukup lateinit dan beri tahu.
    needsManualTtd: !ttd.inserted,
    unfilled: final.unfilled,
    kosong,
    verifyError: final.verifyError,
    // Log gagal = dokumen ada di Drive tapi tidak terlihat di app.
    logError: final.logError,
  };
}
