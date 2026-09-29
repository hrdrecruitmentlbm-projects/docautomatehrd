-- pkwt-contract-backfill.sql — isi kolom masa kontrak untuk dokumen LAMA
--
-- Jalankan SETELAH supabase/pkwt-contract.sql.
--
-- Kenapa perlu: supabase/pkwt-contract.sql menambah kolom tanggal_mulai /
-- tanggal_berakhir sebagai NULL untuk semua baris yang sudah ada. Padahal
-- datanya SUDAH ADA — di form_data, dalam format Bahasa Indonesia
-- ("15 Oktober 2027"), bukan ISO. Tanpa langkah ini, Register Kontrak akan
-- menampilkan semua kontrak lama sebagai "Tanpa masa berlaku" dan KPI
-- "Segera Berakhir" akan menunjukkan nol, padahal kontrak ada yang tinggal
-- beberapa bulan.
--
-- Aman dijalankan ulang (idempotent): hanya mengisi baris yang kolomnya
-- masih NULL, dan format ISO-nya tidak ambigu jadi to_date tidak salah baca.
--
-- HANYA dokumen PKWT. SK/Memo/SP tidak punya masa kontrak.

-- ============ 1. Tanggal mulai & berakhir ============
-- Dipisah dari jangka_bulan: kolom integer dan to_date() punya tipe
-- yang berbeda, dan menggabungkannya dalam satu UPDATE pernah gagal
-- dengan "column is of type integer but expression is of type text".

update document_logs d
set
  tanggal_mulai = to_date(
    p.a[3] || '-' ||
    lpad(case lower(p.a[2])
      when 'januari'   then '1'  when 'februari'  then '2'
      when 'maret'     then '3'  when 'april'     then '4'
      when 'mei'       then '5'  when 'juni'      then '6'
      when 'juli'      then '7'  when 'agustus'   then '8'
      when 'september' then '9'  when 'oktober'   then '10'
      when 'november'  then '11' when 'desember'  then '12'
    end, 2, '0') || '-' || lpad(p.a[1], 2, '0'),
    'YYYY-MM-DD'
  ),
  tanggal_berakhir = to_date(
    p.b[3] || '-' ||
    lpad(case lower(p.b[2])
      when 'januari'   then '1'  when 'februari'  then '2'
      when 'maret'     then '3'  when 'april'     then '4'
      when 'mei'       then '5'  when 'juni'      then '6'
      when 'juli'      then '7'  when 'agustus'   then '8'
      when 'september' then '9'  when 'oktober'   then '10'
      when 'november'  then '11' when 'desember'  then '12'
    end, 2, '0') || '-' || lpad(p.b[1], 2, '0'),
    'YYYY-MM-DD'
  )
from (
  select
    id,
    (regexp_match(form_data->>'tanggal_mulai',    '^(\d{1,2}) ([A-Za-z]+) (\d{4})$')) as a,
    (regexp_match(form_data->>'tanggal_berakhir', '^(\d{1,2}) ([A-Za-z]+) (\d{4})$')) as b
  from document_logs
  where document_type = 'pkwt'
    and form_data is not null
) p
where d.id = p.id
  and p.a is not null
  and p.b is not null
  and (d.tanggal_mulai is null or d.tanggal_berakhir is null);


-- ============ 2. Jangka waktu (bulan) ============
-- Statement terpisah, dengan ::integer yang eksplisit di akhir ekspresi
-- supaya tipe hasilnya dijamin integer, bukan teks.

update document_logs
set jangka_bulan = nullif(
    substring(form_data->>'periode_kontrak' from '^(\d+)'), ''
  )::integer
where document_type = 'pkwt'
  and form_data is not null
  and form_data->>'periode_kontrak' ~ '^\d+'
  and jangka_bulan is null;


-- ============ Verifikasi ============
-- Jalankan ini setelah backfill. Hasil yang benar:
--   pkwt_total = 21, punya_berakhir = 21, belum_ada = 0
select
  count(*) filter (where document_type = 'pkwt')                            as pkwt_total,
  count(*) filter (where document_type = 'pkwt'
                     and tanggal_berakhir is not null)                     as punya_berakhir,
  count(*) filter (where document_type = 'pkwt'
                     and tanggal_berakhir is null)                         as belum_ada,
  min(tanggal_berakhir) filter (where tanggal_berakhir is not null)       as berakhir_pertama,
  max(tanggal_berakhir) filter (where tanggal_berakhir is not null)       as berakhir_terakhir
from document_logs;

-- Daftar yang perlu perhatian: kontrak yang berakhir 30 hari ke depan.
select
  sequence_number,
  document_number,
  employee_name,
  tanggal_mulai,
  tanggal_berakhir,
  tanggal_berakhir - current_date as sisa_hari
from document_logs
where document_type = 'pkwt'
  and tanggal_berakhir is not null
  and tanggal_berakhir between current_date and current_date + 30
order by tanggal_berakhir;
