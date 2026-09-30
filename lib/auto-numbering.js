import { supabaseAdmin } from './supabase';

const DOC_CODE_MAP = {
  pkwt: 'SPK',
  // Surat Keterangan Kerja. Kode ini sudah dipakai di template Paklaring
  // ("No. 00234/SKK-HRD-LBM/..."), jadi dokumen yang dihasilkan punya nomor
  // yang sama persis dengan contoh di kertas — bagus untuk rekonsiliasi arsip.
  paklaring: 'SKK',
  sk: 'SK',
  memo: 'MEMO',
  sp: 'SP',
};

const ROMAN_MONTHS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

/**
 * Nomor urut global, zero-padded ke 4 digit.
 *
 * Memakai sequence Postgres (next_doc_seq) karena COUNT(*)+1 TIDAK aman
 * secara konkuren: dua admin yang menekan tombol di saat sama mendapat
 * nomor yang sama pada dua dokumen hukum. Sequence dilepas di dalam
 * transaksi database, jadi setiap pemanggil pasti dapat angka berbeda.
 *
 * Fallback ke COUNT(*)+1 hanya dipakai sebelum supabase/pkwt-contract.sql
 * dijalankan (fungsi next_doc_seq belum ada) — supaya migrasi tidak
 * menghalangi aplikasi.
 */
async function nextSequence() {
  const { data, error } = await supabaseAdmin.rpc('next_doc_seq');
  if (!error && data != null) {
    const n = Number(data);
    if (Number.isFinite(n) && n > 0) return n;
  }

  // Fallback: schema lama belum punya sequence.
  const { count, error: countError } = await supabaseAdmin
    .from('document_logs')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.error('Error fetching sequence count from Supabase:', countError);
    throw new Error('Could not generate document sequence number');
  }

  return (count ?? 0) + 1;
}

export async function generateDocumentNumber(docType, companyCode, date = new Date()) {
  // 1. Global sequence — see nextSequence() for why this is not COUNT(*).
  const sequence = String(await nextSequence()).padStart(4, '0');

  // 2. Resolve document code from type
  const docCode = DOC_CODE_MAP[docType] || 'DOC'; 

  // 3. Build date parts
  const day = date.getDate();
  const romanMonth = ROMAN_MONTHS[date.getMonth()];
  const year = date.getFullYear();
  const dateCode = `INT.${day}`;

  // 4. Assemble: {SEQUENCE}/ {DOC_CODE}/HRD-{COMPANY}/{DATE_CODE}/{ROMAN_MONTH}/{YEAR}
  return `${sequence}/ ${docCode}/HRD-${companyCode}/${dateCode}/${romanMonth}/${year}`;
}
