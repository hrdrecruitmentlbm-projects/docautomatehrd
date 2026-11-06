-- ============================================================================
-- TAHAP 4 — Penyatuan Data PKWT (document_logs & pkwt_source)
-- Jalankan file ini sekali di Supabase SQL Editor.
-- Aman dijalankan berulang kali (idempotent).
-- ============================================================================

-- ============ 1. Pastikan Kolom document_logs Lengkap ============
alter table document_logs
  add column if not exists google_doc_id     text,
  add column if not exists google_doc_url    text,
  add column if not exists tanggal_mulai     date,
  add column if not exists tanggal_berakhir  date,
  add column if not exists jangka_bulan      integer,
  add column if not exists status_dokumen    text not null default 'draft',
  add column if not exists employee_nama_key text,
  add column if not exists lini_bisnis       text,
  add column if not exists unfilled_marks    text[],
  add column if not exists verified_at       timestamptz;

-- Jaga agar status_dokumen tidak melebar di luar nilai yang dikenal
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

-- ============ 2. Indeks untuk Query & Dedup document_logs ============
create index if not exists document_logs_google_doc_id_idx
  on document_logs (google_doc_id)
  where google_doc_id is not null;

create index if not exists document_logs_dedup_key_idx
  on document_logs (employee_nama_key, tanggal_mulai)
  where employee_nama_key is not null;

create index if not exists document_logs_doc_type_idx
  on document_logs (document_type);

create index if not exists document_logs_status_dokumen_idx
  on document_logs (status_dokumen);

create index if not exists document_logs_berakhir_idx
  on document_logs (tanggal_berakhir);

create index if not exists document_logs_company_idx
  on document_logs (company_code);

-- ============ 3. Indeks untuk Query & Dedup pkwt_source ============
create index if not exists pkwt_source_file_id_idx
  on pkwt_source (file_id);

create index if not exists pkwt_source_dedup_key_idx
  on pkwt_source (nama_key, tanggal_mulai)
  where nama_key is not null;

create index if not exists pkwt_source_perlu_dicek_idx
  on pkwt_source (perlu_dicek);

create index if not exists pkwt_source_manual_override_idx
  on pkwt_source (manual_override);

create index if not exists pkwt_source_kode_perusahaan_idx
  on pkwt_source (kode_perusahaan);

create index if not exists pkwt_source_tanggal_berakhir_idx
  on pkwt_source (tanggal_berakhir);

-- ============ 4. View SQL Penyatuan Kontrak (v_unified_contracts) ============
-- View yang menyatukan document_logs (aplikasi) dan pkwt_source (drive),
-- dengan dedup berbasis file_id dan cadangan (nama_key, tanggal_mulai).
-- Bila ada di dua sumber, document_logs diutamakan (sumber: 'aplikasi').
create or replace view v_unified_contracts as
with app_contracts as (
  select
    'app_' || id::text as id,
    id as source_id,
    'aplikasi'::text as sumber,
    google_doc_id as file_id,
    document_number as nomor_surat,
    sequence_number,
    employee_name as nama_asli,
    coalesce(employee_nama_key, lower(replace(employee_name, ' ', ''))) as nama_key,
    coalesce(company_code, lini_bisnis) as kode_perusahaan,
    lini_bisnis,
    null::text as bulan_folder,
    periode_bulan,
    tanggal_mulai::text as tanggal_mulai,
    tanggal_berakhir::text as tanggal_berakhir,
    jangka_bulan,
    coalesce(status_dokumen, 'draft') as status_dokumen,
    coalesce(google_doc_url, case when google_doc_id is not null then 'https://docs.google.com/document/d/' || google_doc_id || '/edit' else null end) as url,
    created_at,
    false as perlu_dicek,
    null::text as alasan_cek,
    false as manual_override
  from document_logs
  where document_type = 'pkwt'
),
drive_contracts as (
  select
    'drive_' || id::text as id,
    id as source_id,
    'drive'::text as sumber,
    file_id,
    nomor_surat,
    null::integer as sequence_number,
    nama_asli,
    coalesce(nama_key, lower(replace(nama_asli, ' ', ''))) as nama_key,
    kode_perusahaan,
    kode_perusahaan as lini_bisnis,
    bulan_folder,
    null::text as periode_bulan,
    tanggal_mulai,
    tanggal_berakhir,
    jangka_bulan,
    'arsip'::text as status_dokumen,
    coalesce(url, case when file_id is not null then 'https://docs.google.com/document/d/' || file_id || '/edit' else null end) as url,
    coalesce(scanned_at, drive_modified_time) as created_at,
    perlu_dicek,
    alasan_cek,
    manual_override
  from pkwt_source
  where
    -- Dedup Kunci Utama: Jangan masukkan file_id yang sudah ada di document_logs
    (file_id is null or file_id not in (select google_doc_id from document_logs where google_doc_id is not null and document_type = 'pkwt'))
    and
    -- Dedup Kunci Cadangan: Jangan masukkan (nama_key, tanggal_mulai) yang sudah ada di document_logs
    (
      nama_key is null or tanggal_mulai is null or
      (nama_key, tanggal_mulai) not in (
        select employee_nama_key, tanggal_mulai::text
        from document_logs
        where employee_nama_key is not null and tanggal_mulai is not null and document_type = 'pkwt'
      )
    )
)
select * from app_contracts
union all
select * from drive_contracts;

-- ============ 5. Reload Schema Cache PostgREST ============
notify pgrst, 'reload schema';
