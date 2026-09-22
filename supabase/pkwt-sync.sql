-- PKWT sync persistence — run once in Supabase SQL Editor.
-- Stores the pasted Google Sheet / Drive folder links per user
-- so the Data page remembers them. Safe to re-run (idempotent).

alter table settings add column if not exists master_sheet_url text;
alter table settings add column if not exists master_tab text;
alter table settings add column if not exists payroll_folder_url text;
