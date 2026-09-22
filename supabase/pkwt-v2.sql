-- PKWT v2 —_hr document automation_
-- Jalankan file ini sekali di Supabase SQL Editor (project yang sama dengan
-- NEXT_PUBLIC_SUPABASE_URL). Aman dijalankan ulang (idempotent).
--
-- Isi:
-- 1. employees            — cache database master karyawan (join key: nama_key)
-- 2. payroll_latest       — cache payroll bulan TERBARU per karyawan (selalu overwrite)
-- 3. company_map          — LINI BISNIS (mentah dari master) -> company/KOP/template
-- 4. Kolom tambahan di document_logs untuk audit PKWT otomatis.

-- ============ 1. employees ============
create table if not exists employees (
  nama_key text primary key,
  nama_asli text not null,
  nik_internal text,
  posisi text,
  divisi text,
  lini_bisnis text,
  unit text,
  tempat_lahir text,
  tanggal_lahir text,
  alamat_tinggal text,
  alamat_ktp text,
  no_ktp text,
  no_telp text,
  status_karyawan text,
  tanggal_masuk text,
  updated_at timestamp with time zone default now()
);
create index if not exists employees_nama_asli_idx on employees (nama_asli);

-- ============ 2. payroll_latest ============
create table if not exists payroll_latest (
  nama_key text primary key references employees (nama_key) on delete cascade,
  nama_asli text not null,
  posisi text,
  divisi text,
  unit text,
  gapok integer default 0,
  u_makan integer default 0,
  u_transport integer default 0,
  penyesuaian integer default 0,
  t_jabatan integer default 0,
  t_fungsional integer default 0,
  t_kesehatan integer default 0,
  t_transport integer default 0,
  bonus_hadir integer default 0,
  periode_bulan text,
  updated_at timestamp with time zone default now()
);

-- ============ 3. company_map ============
-- lini_bisnis  : string mentah dari master, disimpan UPPERCASE-trim
--                (cth: 'LBM','MARKETPLACE','WMS','UBR','SAHAM','TALOG','TAST')
-- company_code : kode KOP/penomoran (cth: 'NUMETA'); NULL = belum punya KOP
-- Baris khusus '__FALLBACK__' = template generik tanpa KOP untuk
-- SAHAM / TALOG / TAST (dokumen tetap dibuat, KOP ditambah manual).
create table if not exists company_map (
  lini_bisnis text primary key,
  company_code text,
  legal_name text,
  pkwt_template_id text,
  pkwt_folder_id text,
  updated_at timestamp with time zone default now()
);

-- Seed awal sesuai kesepakatan (template/folder diisi via halaman Data):
-- LBM->LBM, MJO->MJO, NUMETA->NUMETA, MARKETPLACE->NUMETA,
-- TUNET->TUNET, WMS->TUNET, UBR->MSH, MSH->MSH, LKM->LKM, DGL->DGL,
-- SAHAM/TALOG/TAST -> NULL (tanpa KOP).
insert into company_map (lini_bisnis, company_code) values
  ('LBM', 'LBM'),
  ('MJO', 'MJO'),
  ('NUMETA', 'NUMETA'),
  ('MARKETPLACE', 'NUMETA'),
  ('TUNET', 'TUNET'),
  ('WMS', 'TUNET'),
  ('UBR', 'MSH'),
  ('MSH', 'MSH'),
  ('LKM', 'LKM'),
  ('DGL', 'DGL'),
  ('SAHAM', null),
  ('TALOG', null),
  ('TAST', null),
  ('__FALLBACK__', null)
on conflict (lini_bisnis) do nothing;

-- ============ 4. document_logs: kolom audit tambahan ============
alter table document_logs add column if not exists employee_nama_key text;
alter table document_logs add column if not exists lini_bisnis text;
alter table document_logs add column if not exists periode_bulan text;
