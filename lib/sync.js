// Shared sync logic: array-of-arrays (from uploaded files OR Google Sheets)
// -> map columns -> upsert Supabase. Single source of truth for
// /api/import-master, /api/import-payroll, /api/sync-master, /api/sync-payroll.
import { supabaseAdmin, friendlyDbError } from "@/lib/supabase";
import { mapMasterRows, mapPayrollRows } from "@/lib/spreadsheet";

function cleanRows(aoa) {
  return (aoa || []).filter((r) => (r || []).some((c) => String(c ?? "").trim() !== ""));
}

export function findMasterHeaderIndex(aoa) {
  return (aoa || []).findIndex((r) =>
    (r || []).some((c) => String(c || "").toLowerCase().replace(/\s+/g, " ").trim() === "nama")
  );
}

export function findPayrollHeaderIndex(aoa) {
  return (aoa || []).findIndex((r) =>
    (r || []).some((c) => {
      const v = String(c || "").toLowerCase().replace(/\s+/g, " ").trim();
      return v === "nama karyawan" || v === "nama";
    })
  );
}

export async function syncMasterAoa(aoa, sheetLabel) {
  const rows = cleanRows(aoa);
  const headerIdx = findMasterHeaderIndex(rows);
  if (headerIdx < 0) {
    throw new Error('Baris header NAMA tidak ditemukan. Pastikan tab master yang benar dipilih.');
  }
  const headers = rows[headerIdx].map((c) => String(c ?? ""));
  const dataRows = rows.slice(headerIdx + 1);

  const { employees } = mapMasterRows(headers, dataRows);
  if (employees.length === 0) {
    throw new Error("Tidak ada baris karyawan valid (kolom NAMA kosong?)");
  }

  await upsertEmployees(employees);

  const distinctLiniBisnis = [...new Set(employees.map((e) => e.lini_bisnis).filter(Boolean))].sort();
  return { success: true, total: employees.length, distinctLiniBisnis, sheet: sheetLabel };
}

export async function upsertEmployees(employees) {
  const payload = employees.map((e) => ({ ...e, updated_at: new Date().toISOString() }));
  let error;
  try {
    ({ error } = await supabaseAdmin.from("employees").upsert(payload, { onConflict: "nama_key" }));
  } catch (e) {
    throw new Error(friendlyDbError(e));
  }
  if (error) throw new Error(friendlyDbError(error));
}

export async function syncPayrollAoa(aoa, periodeBulan) {
  if (!/^\d{4}-\d{2}$/.test(periodeBulan || "")) {
    throw new Error("Periode bulan tidak valid (format YYYY-MM).");
  }
  const rows = cleanRows(aoa);
  const headerIdx = findPayrollHeaderIndex(rows);
  if (headerIdx < 0) {
    throw new Error("Baris header Nama Karyawan tidak ditemukan.");
  }
  const headers = rows[headerIdx].map((c) => String(c ?? ""));
  const dataRows = rows.slice(headerIdx + 1);

  const { payrolls } = mapPayrollRows(headers, dataRows, periodeBulan);
  if (payrolls.length === 0) {
    throw new Error("Tidak ada baris payroll valid.");
  }

  const keys = payrolls.map((p) => p.nama_key);
  // This read MUST succeed: swallowing it would report every name as unmatched.
  let existing;
  try {
    const res = await supabaseAdmin.from("employees").select("nama_key").in("nama_key", keys);
    if (res.error) throw res.error;
    existing = res.data;
  } catch (e) {
    throw new Error(friendlyDbError(e));
  }
  const existingSet = new Set((existing || []).map((e) => e.nama_key));
  const unmatched = payrolls.filter((p) => !existingSet.has(p.nama_key)).map((p) => p.nama_asli);

  const payload = payrolls
    .filter((p) => existingSet.has(p.nama_key))
    .map((p) => ({ ...p, updated_at: new Date().toISOString() }));

  if (payload.length > 0) {
    let error;
    try {
      ({ error } = await supabaseAdmin.from("payroll_latest").upsert(payload, { onConflict: "nama_key" }));
    } catch (e) {
      throw new Error(friendlyDbError(e));
    }
    if (error) throw new Error(friendlyDbError(error));
  }

  return {
    success: true,
    total: payrolls.length,
    matched: payload.length,
    unmatched,
    periode_bulan: periodeBulan,
    note: unmatched.length > 0 ? `${unmatched.length} nama tidak cocok dengan master (cek ejaan)` : undefined,
  };
}

// Persist sync config to settings. Never throws: returns hint when migration is missing.

export async function persistSettingsForUser(email, patch) {
  try {
    const { data: existing } = await supabaseAdmin
      .from("settings")
      .select("id")
      .eq("user_email", email)
      .single();
    let result;
    if (existing) {
      result = await supabaseAdmin.from("settings").update(patch).eq("user_email", email);
    } else {
      result = await supabaseAdmin.from("settings").insert({ user_email: email, ...patch });
    }
    if (result.error) {
      if (/column/i.test(result.error.message || "")) {
        return "Jalankan supabase/pkwt-sync.sql agar link tersimpan otomatis.";
      }
      return result.error.message;
    }
    return null;
  } catch (e) {
    return e.message;
  }
}
