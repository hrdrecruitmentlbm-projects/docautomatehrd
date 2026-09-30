-- Bersihkan TEMPLATE ID Paklaring hasil backfill di paklaring.sql.
--
-- KAPAN DIJALANKAN: sekali, setelah supabase/paklaring.sql.
--
-- MASALAH: paklaring.sql menyalin pkwt_template_id ke paklaring_template_id
-- "supaya tidak perlu menempel ID baru di 12 baris". Akibatnya setiap baris
-- yang punya template PKWT sekarang menunjuk ke TEMPLATE PKWT. Generate
-- Paklaring akan menyalin kontrak kerja, mengisi penanda Paklaring padanya,
-- dan menyimpannya bernomor SKK — tanpa satu pesan pun.
--
-- Statement ini sengaja SANGAT SPESIFIK: hanya menghapus nilai yang MASIH sama
-- dengan pkwt_template_id, yaitu hanya sisa backfill. ID Paklaring yang sudah
-- kamu isi sendiri tidak tersentuh. Aman dijalankan berulang kali.
--
-- Catatan: template PKWT dan Paklaring memang tidak mungkin sama dokumennya,
-- jadi tidak ada risiko menghapus konfigurasi yang benar.

update company_map
   set paklaring_template_id = null
 where paklaring_template_id is not null
   and pakwt_template_id is not null
   and paklaring_template_id = pkwt_template_id;

-- Verifikasi: kolom ini harus NULL semua sebelum kamu isi ID yang benar.
-- select lini_bisnis, pkwt_template_id, paklaring_template_id
--   from company_map
--  where paklaring_template_id is not null;
--
-- Setelah diisi, pastikan TIDAK ADA baris yang nilainya sama seperti ini:
-- select lini_bisnis from company_map
--  where paklaring_template_id = pkwt_template_id;
