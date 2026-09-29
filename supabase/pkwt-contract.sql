-- pkwt-contract.sql — _masa kontrak & lifecycle dokumen_
-- Jalankan sekali di Supabase SQL Editor (project yang sama dengan
-- NEXT_PUBLIC_SUPABASE_URL). Aman dijalankan ulang (idempotent).
--
-- Isi:
-- 1. Kolom lifecycle di document_logs (masa kontrak, status, hasil pemeriksaan)
-- 2. Index document_logs (saat ini TIDAK ADA index di kolom mana pun)
-- 3. Sequence dokumen sungguhan (menggantikan COUNT(*)+1 yang tidak aman secara
--    konkuren — dua admin yang membuat dokumen bersamaan bisa mendapat nomor
--    yang sama pada dua dokumen hukum).
-- 4. Fungsi next_doc_seq() + unique index sequence_number.
--
-- Degrasi aman: file BELUM dijalankanpun aplikasi tetap jalan —
-- lib/auto-numbering.js jatuh kembali ke COUNT(*)+1, dan
-- app/api/generate-document/route.js mengulang insert tanpa kolom baru
-- bila Postgres melaporkan kolom tidak ada.

-- ============ 1. Kolom lifecycle ============
-- date (bukan text): tanggal_mulai/tanggal_berakhir disimpan sebagai ISO
-- ('2026-06-01') supaya bisa diurutkan, difilter, dan di-index.
-- Versi Bahasa Indonesia ("1 Juni 2027") tetap tersimpan di form_data
-- sebagai salinan arsip — halaman rincian membacanya dari sana.
--
-- status_dokumen menyimpan nilai mesin (draft); label tampilannya "Draf"
-- dipetakan di components/documents/DocumentStatus.jsx.
alter table document_logs
  add column if not exists tanggal_mulai     date,
  add column if not exists tanggal_berakhir  date,
  add column if not exists jangka_bulan      integer,
  add column if not exists status_dokumen    text not null default 'draft',
  add column if not exists unfilled_marks    text[],
  add column if not exists verified_at       timestamptz;

-- Jaga agar status_dokumen tidak melebar di luar nilai yang dikenal.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'document_logs_status_dokumen_check'
  ) then
    alter table document_logs
      add constraint document_logs_status_dokumen_check
      check (status_dokumen in ('draft', 'dikirim', 'ditandatangani', 'arsip'));
  end if;
end $$;

-- ============ 2. Index ============
create index if not exists document_logs_berakhir_idx
  on document_logs (tanggal_berakhir);
create index if not exists document_logs_employee_idx
  on document_logs (employee_nama_key);
create index if not exists document_logs_created_idx
  on document_logs (created_at desc);
create index if not exists document_logs_company_idx
  on document_logs (company_code);

-- Mempercepat register kontrak: cari kontrak terbaru per karyawan.
create index if not exists document_logs_employee_created_idx
  on document_logs (employee_nama_key, created_at desc);

-- ============ 3. Sequence dokumen ============
-- Diberi start dari max(sequence_number) yang sudah ada supaya dokumen
-- baru tidak menabrak nomor lama.
create sequence if not exists doc_seq start 1;

select setval(
  'doc_seq',
  greatest((select coalesce(max(sequence_number), 0) from document_logs), 0) + 1,
  false
);

create or replace function next_doc_seq() returns integer
language sql volatile as $$
  select nextval('doc_seq')::integer;
$$;

grant execute on function next_doc_seq() to service_role;

-- ============ 4. Nomor dokumen harus unik ============
-- PERINGATAN: bila index ini GAGAL dibuat, itu berarti sudah ada nomor
-- ganda di document_logs (dari kondisi balapan COUNT(*)+1 yang lama).
-- Deteksi dulu, bersihkan, baru jalankan ulang:
--
--   select sequence_number, count(*)
--   from document_logs
--   where sequence_number is not null
--   group by sequence_number
--   having count(*) > 1
--   order by sequence_number;
--
-- Index sengaja TIDAK diberi unique pada langkah ini kalau Anda ingin
-- aplikasi tetap jalan tanpa membersihkan data lama — numbering sudah
-- aman karena memakai sequence, jadi unik ini hanya lapisan kedua.
create unique index if not exists document_logs_sequence_uidx
  on document_logs (sequence_number)
  where sequence_number is not null;
