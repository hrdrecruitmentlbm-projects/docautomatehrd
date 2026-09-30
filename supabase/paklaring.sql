-- Paklaring (Surat Keterangan Kerja) — kolom template/folder + audit tanggal keluar.
-- Jalankan sekali di Supabase SQL Editor (project yang sama dengan
-- NEXT_PUBLIC_SUPABASE_URL). Idempotent, aman dijalankan ulang.
--
-- Aman TIDAK menjalankan file ini: aplikasi tetap jalan — engine Paklaring
-- akan memberi pesan "Template Paklaring untuk <KODE> belum dikonfigurasi"
-- alih-alih gagal diam-diam.
--
-- Template/folder TIDAK disimpan per perusahaan lewat kolom baru. Paklaring
-- memakai rantai fallback:
--     company_map.paklaring_template_id  -> company_map.__FALLBACK__ -> settings
--     company_map.paklaring_folder_id    -> pkwt_folder_id (root yang sama: HRIS PKWT)
-- Karena folder root Paklaring = folder root PKWT ("HRIS PKWT"), menambah
-- kolom folder per perusahaan hanya menghasilkan dua belas salinan ID yang
-- pasti someday berbeda satu karakter dari yang lain.

-- ============ 1. Template Paklaring per lini bisnis ============
alter table company_map add column if not exists paklaring_template_id text;

-- Backfill: salin template PKWT untuk baris yang sudah punya, supaya template
-- awal bisa dicoba tanpa menempel ID baru di 12 baris. Template Paklaring
-- TETAP harus diganti manual per perusahaan — ID ini hanya titik awal.
update company_map
   set paklaring_template_id = pkwt_template_id
 where paklaring_template_id is null
   and pkwt_template_id is not null;

-- ============ 2. Audit tanggal keluar ============
-- Sengaja TIDAK memakai tanggal_berakhir: itu berarti "kontrak berakhir",
-- sedangkan Paklaring berarti "karyawan berhenti". Menyamakan keduanya
-- membuat Register menampilkan "Kedaluwarsa" untuk surat yang sedang aktif.
alter table document_logs add column if not exists tanggal_keluar text;

-- ============ 3. Indeks untuk filter hub ============
create index if not exists document_logs_tanggal_keluar_idx
  on document_logs (tanggal_keluar desc)
  where tanggal_keluar is not null;

-- Verifikasi manual (hasil expected: 1 = true)
-- select exists (
--   select 1 from information_schema.columns
--   where table_name = 'company_map' and column_name = 'paklaring_template_id'
-- ) as ok_paklaring_template,
--   exists (
--   select 1 from information_schema.columns
--   where table_name = 'document_logs' and column_name = 'tanggal_keluar'
-- ) as ok_tanggal_keluar;
