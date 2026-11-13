-- jatuh-tempo.sql — Skema jatuh tempo PKWT & masa berlaku SP
-- Jalankan sekali di Supabase SQL Editor. Aman dijalankan ulang (idempotent).

-- 1. employees: tambah tanggal_habis_kontrak dari master (kolom J: TANGGAL HABIS KONTRAK)
alter table employees
  add column if not exists tanggal_habis_kontrak date;

-- 2. document_logs: pelacakan dokumen yang diperpanjang & masa berlaku dokumen
alter table document_logs
  add column if not exists perpanjangan_dari uuid null,
  add column if not exists masa_berlaku_bulan integer null;

-- 3. settings: konfigurasi masa berlaku SP (default 6 bulan; NULL = tanpa masa berlaku) & timestamp sync master
alter table settings
  add column if not exists sp1_masa_berlaku_bulan integer default 6,
  add column if not exists sp2_masa_berlaku_bulan integer default 6,
  add column if not exists sp3_masa_berlaku_bulan integer default 6,
  add column if not exists last_master_sync_at timestamptz;

-- 4. Index performa query jatuh tempo
create index if not exists employees_tanggal_habis_kontrak_idx
  on employees (tanggal_habis_kontrak);

create index if not exists document_logs_perpanjangan_idx
  on document_logs (perpanjangan_dari);

create index if not exists document_logs_type_berakhir_idx
  on document_logs (document_type, tanggal_berakhir);
