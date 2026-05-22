import { supabaseAdmin } from './supabase';

const DOC_CODE_MAP = {
  pkwt: 'SPK',
  sk: 'SK',
  memo: 'MEMO',
  sp: 'SP',
};

const ROMAN_MONTHS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

export async function generateDocumentNumber(docType, companyCode, date = new Date()) {
  // 1. Get global sequence: COUNT(*) of all rows in document_logs + 1
  const { count, error } = await supabaseAdmin
    .from('document_logs')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('Error fetching sequence count from Supabase:', error);
    throw new Error('Could not generate document sequence number');
  }

  const sequence = String((count ?? 0) + 1).padStart(4, '0');

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
