import { supabaseAdmin } from './supabase';
import { copyTemplate, replacePlaceholders, buildDocUrl, insertKopImage } from './google';
import { generateDocumentNumber } from './auto-numbering';
import { getOrCreateFolder } from './drive-folders';
import {
  resolveCompany,
  buildPkwtReplacements,
  addMonths,
  formatTanggalId,
  formatMonthYearId,
} from './pkwt';
import { contractColumns } from './contract-lifecycle';
import { buildDocumentFileName } from './file-name';
import { verifyDocument } from './template-scan';

/**
 * Satu-satunya jalur pembuatan PKWT di aplikasi ini.
 *
 * Dipakai oleh app/api/generate-document/route.js (form PKWT biasa) dan
 * app/api/documents/duplicate/route.js (Buat Salinan / perpanjangan).
 * Keduanya butuh langkah yang persis sama — menyalin template, mengisi
 * penanda, memasang KOP, mengarsipkan, mencatat, memeriksa — jadi logika
 * ini TIDAK diduplikasi di dua route.
 *
 * Kontrak nilai balik:
 *   gagal  -> { ok: false, status, error }
 *   sukses -> { ok: true, ...payload }
 * Tidak pernah melempar error: pemanggil yang membungkus jadi Response.
 */
export async function generatePkwt({ session, settings, employeeKey, manual = {} }) {
  const key = String(employeeKey || '').toLowerCase().trim();
  if (!key) return { ok: false, status: 400, error: 'employeeKey wajib diisi' };

  const { data: employee, error: empError } = await supabaseAdmin
    .from('employees')
    .select('*')
    .eq('nama_key', key)
    .single();
  if (empError || !employee) {
    return {
      ok: false,
      status: 404,
      error: 'Karyawan tidak ditemukan di database. Impor master dulu di halaman Data.',
    };
  }

  // Payroll kosong TIDAK boleh diam-diam jadi kontrak bergaji nol. Dokumen
  // hukum dengan Gapok Rp 0,- adalah kegagalan paling berbahaya di app ini,
  // jadi hentikan di sini dengan instruksi yang bisa ditindaklanjuti.
  const { data: payroll, error: payrollError } = await supabaseAdmin
    .from('payroll_latest')
    .select('*')
    .eq('nama_key', key)
    .single();
  if (payrollError && !/PGRST116|no rows/i.test(payrollError.message || '')) {
    return {
      ok: false,
      status: 500,
      error: `Gagal membaca data payroll: ${payrollError.message}. Coba ulangi atau sync ulang payroll.`,
    };
  }
  if (!payroll) {
    return {
      ok: false,
      status: 422,
      error:
        'Payroll untuk karyawan ini belum ada, jadi komponen gaji di kontrak akan kosong. ' +
        'Sync payroll di halaman Data dulu, lalu ulangi. Kontrak tidak dibuat untuk mencegah isian yang salah.',
    };
  }

  const liniBisnis = employee.lini_bisnis || '';
  const { data: mapping } = await supabaseAdmin
    .from('company_map')
    .select('*')
    .eq('lini_bisnis', liniBisnis.toUpperCase().trim())
    .single();
  const { data: fallbackMap } = await supabaseAdmin
    .from('company_map')
    .select('*')
    .eq('lini_bisnis', '__FALLBACK__')
    .single();

  const resolved = resolveCompany(liniBisnis);
  const mappedCode = mapping?.company_code || null;
  const hasKop = !!mappedCode || resolved.hasKop;
  const companyCode = mappedCode || resolved.companyCode;
  // Penomoran: pakai kode KOP bila ada, sonst nama lini bisnis mentah (cth: HRD-SAHAM).
  const numberingCode = hasKop ? companyCode : (liniBisnis || 'UMUM');

  // Template: per-perusahaan bila ada KOP, sonst fallback generik (tanpa KOP).
  const templateId = hasKop
    ? (mapping?.pkwt_template_id || fallbackMap?.pkwt_template_id || settings?.pkwt_template_id)
    : (fallbackMap?.pkwt_template_id || settings?.pkwt_template_id);
  const folderId = hasKop
    ? (mapping?.pkwt_folder_id || fallbackMap?.pkwt_folder_id || settings?.pkwt_folder_id)
    : (fallbackMap?.pkwt_folder_id || settings?.pkwt_folder_id);

  if (!templateId || !folderId) {
    return {
      ok: false,
      status: 400,
      error: hasKop
        ? `Template PKWT untuk ${companyCode} belum dikonfigurasi. Isi di halaman Data > Pemetaan Perusahaan (atau Settings sebagai fallback).`
        : 'Template generik (tanpa KOP) belum dikonfigurasi. Isi fallback di halaman Data > Pemetaan Perusahaan baris __FALLBACK__ (atau Settings).',
    };
  }

  // Input manual yang tersisa: tanggal_mulai, periode/jangka, tanggal_ttd.
  const tanggalMulaiRaw = manual.tanggal_mulai;
  if (!tanggalMulaiRaw) {
    return { ok: false, status: 400, error: 'tanggal_mulai wajib diisi' };
  }
  const jangkaBulan = parseInt(manual.jangka_bulan || manual.jangka_waktu || '0', 10) || 0;
  let tanggalBerakhirRaw = manual.tanggal_berakhir;
  if (!tanggalBerakhirRaw && jangkaBulan > 0) {
    tanggalBerakhirRaw = addMonths(new Date(tanggalMulaiRaw), jangkaBulan)
      .toISOString()
      .slice(0, 10);
  }
  const periodeKontrak =
    manual.periode_kontrak || (jangkaBulan > 0 ? `${jangkaBulan} Bulan` : '');
  const tanggalTtdRaw = manual.tanggal_ttd || new Date().toISOString().slice(0, 10);

  const documentNumber = await generateDocumentNumber('pkwt', numberingCode);
  const sequenceNumber = parseInt(documentNumber.split('/')[0], 10);

  const replacements = buildPkwtReplacements({
    employee,
    payroll,
    manual: {
      tanggal_mulai: tanggalMulaiRaw,
      tanggal_berakhir: tanggalBerakhirRaw || '',
      periode_kontrak: periodeKontrak,
      tanggal_ttd: tanggalTtdRaw,
    },
    documentNumber,
    companyLegal: mapping?.legal_name || companyCode,
  });
  // Pihak Pertama selalu hardcode di template (Dena Kurniawan) — tidak dioverride.

  const displayName = employee.nama_asli || 'Document';
  // Nama berkas = nomor surat utuh + "_" + nama. Lihat lib/file-name.js.
  const fileName = buildDocumentFileName(documentNumber, employee.nama_asli);

  // ---- Arsip PKWT: HRIS PKWT/<Bulan Tahun>/<KODE PERUSAHAAN> ----
  // Bulan = tanggal pembuatan (sama dengan dasar nomor surat).
  // Kode = company_code dari /data (company_map); baris tanpa KOP memakai
  // lini_bisnis mentah -> selalu sama dengan segmen HRD-XXX di nomor surat.
  // Gagal menyiapkan arsip TIDAK boleh membatalkan dokumen: fallback ke
  // folder root dengan catatan di respons.
  let targetFolderId = folderId;
  let folderPath = null;
  let folderNote = '';
  try {
    const monthFolder = formatMonthYearId(new Date());
    const divisionFolder = String(numberingCode || 'UMUM').toUpperCase();
    const memo = new Map();
    const monthFolderId = await getOrCreateFolder(session.accessToken, folderId, monthFolder, memo);
    targetFolderId = await getOrCreateFolder(session.accessToken, monthFolderId, divisionFolder, memo);
    folderPath = `${monthFolder}/${divisionFolder}`;
  } catch (e) {
    console.error('Archive folder resolution failed, falling back to root folder:', e);
    targetFolderId = folderId;
    folderPath = null;
    folderNote = `Folder arsip gagal dibuat (${e.message}) — dokumen disimpan di folder root.`;
  }

  const docId = await copyTemplate(session.accessToken, templateId, fileName, targetFolderId);
  await replacePlaceholders(session.accessToken, docId, replacements);

  // KOP otomatis: sisipkan gambar perusahaan di tanda {{kop}}, lalu hapus tanda.
  let kop = { inserted: false, note: '' };
  try {
    kop = await insertKopImage(session.accessToken, docId, {
      companyCode: hasKop ? companyCode : '',
      hasKop,
    });
  } catch (e) {
    kop = { inserted: false, note: `KOP gagal diproses: ${e.message}` };
  }

  // Pemeriksaan hasil: penanda {{…}} yang masih tertinggal berarti ada
  // isian yang gagal masuk ke kontrak. Dilaporkan, TIDAK membatalkan —
  // dokumen sudah ada di Drive dan penomoran sudah terpakai.
  const verify = await verifyDocument(session.accessToken, docId);

  const docUrl = buildDocUrl(docId);
  const formSnapshot = {
    source: 'pkwt-auto',
    employee_nama_key: key,
    tanggal_mulai: formatTanggalId(tanggalMulaiRaw),
    tanggal_berakhir: formatTanggalId(tanggalBerakhirRaw),
    periode_kontrak: periodeKontrak,
    tanggal_ttd: formatTanggalId(tanggalTtdRaw),
    payroll_periode: payroll?.periode_bulan || null,
    employee,
    payroll,
  };

  // Insert log: coba dengan kolom lifecycle baru, fallback ke skema lama
  // bila supabase/pkwt-contract.sql belum dijalankan.
  const baseRow = {
    user_email: session.user.email,
    document_type: 'pkwt',
    document_number: documentNumber,
    sequence_number: sequenceNumber,
    company_code: numberingCode,
    employee_name: displayName,
    google_doc_id: docId,
    google_doc_url: docUrl,
    form_data: formSnapshot,
  };

  let logError = null;
  const withLifecycle = await supabaseAdmin.from('document_logs').insert({
    ...baseRow,
    ...contractColumns({
      tanggalMulai: tanggalMulaiRaw,
      tanggalBerakhir: tanggalBerakhirRaw,
      jangkaBulan,
      statusDokumen: 'draft',
    }),
    employee_nama_key: key,
    lini_bisnis: liniBisnis,
    periode_bulan: payroll?.periode_bulan || null,
    folder_id: targetFolderId,
    folder_path: folderPath,
    ...(verify.unfilled.length
      ? { unfilled_marks: verify.unfilled, verified_at: new Date().toISOString() }
      : {}),
  });
  if (withLifecycle.error && /column/i.test(withLifecycle.error.message || '')) {
    const retry = await supabaseAdmin.from('document_logs').insert(baseRow);
    logError = retry.error;
  } else {
    logError = withLifecycle.error;
  }
  if (logError) console.error('Failed to log PKWT generation:', logError);

  return {
    ok: true,
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
    // Penanda yang tidak terisi otomatis; array kosong = semua isian masuk.
    unfilled: verify.unfilled,
    verifyError: verify.error || null,
    // Log gagal = dokumen ada di Drive tapi tidak terlihat di app.
    logError: logError ? logError.message : null,
  };
}
