import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { mapMasterRows } from "@/lib/spreadsheet";
import * as XLSX from "xlsx";

// POST /api/import-master — multipart: file (.xlsx/.csv).
// Parse -> mapping kolom fleksibel -> upsert employees.
export async function POST(req) {
  const session = await auth();
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  let form;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Body harus multipart form-data" }, { status: 400 });
  }
  const file = form.get("file");
  if (!file || typeof file.arrayBuffer !== "function") {
    return Response.json({ error: "File .xlsx/.csv wajib diunggah" }, { status: 400 });
  }
  const buf = Buffer.from(await file.arrayBuffer());
  let wb;
  try {
    wb = XLSX.read(buf, { type: "buffer" });
  } catch {
    return Response.json({ error: "File tidak bisa dibaca sebagai spreadsheet" }, { status: 400 });
  }
  const sheetName = wb.SheetNames[0];
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, raw: true, defval: "" });

  // Cari baris header yang mengandung "NAMA" (lewati judul/filter di atasnya).
  let headerIdx = aoa.findIndex((r) =>
    (r || []).some((c) => String(c || "").toLowerCase().replace(/\s+/g, " ").trim() === "nama")
  );
  if (headerIdx < 0) {
    return Response.json({ error: "Baris header NAMA tidak ditemukan di sheet pertama" }, { status: 400 });
  }
  const headers = aoa[headerIdx].map((c) => String(c ?? ""));
  const rows = aoa.slice(headerIdx + 1).filter((r) => (r || []).some((c) => String(c ?? "").trim() !== ""));

  const { employees } = mapMasterRows(headers, rows);
  if (employees.length === 0) {
    return Response.json({ error: "Tidak ada baris karyawan valid (kolom NAMA kosong?)" }, { status: 400 });
  }

  const payload = employees.map((e) => ({ ...e, updated_at: new Date().toISOString() }));
  const { error } = await supabaseAdmin.from("employees").upsert(payload, { onConflict: "nama_key" });
  if (error) {
    const missing = /relation|table|schema/i.test(error.message || "");
    return Response.json(
      { error: error.message, hint: missing ? "Jalankan supabase/pkwt-v2.sql di SQL Editor" : undefined },
      { status: 500 }
    );
  }

  const distinctLiniBisnis = [...new Set(employees.map((e) => e.lini_bisnis).filter(Boolean))].sort();
  return Response.json({
    success: true,
    total: employees.length,
    distinctLiniBisnis,
    sheet: sheetName,
  });
}
