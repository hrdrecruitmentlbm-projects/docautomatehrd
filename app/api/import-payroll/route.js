import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { mapPayrollRows } from "@/lib/spreadsheet";
import * as XLSX from "xlsx";

// POST /api/import-payroll — multipart: file + periode_bulan (YYYY-MM).
// Selalu overwrite payroll_latest (gaji terbaru yang dipakai PKWT).
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
  const periodeBulan = String(form.get("periode_bulan") || "").trim();
  if (!file || typeof file.arrayBuffer !== "function") {
    return Response.json({ error: "File payroll .xlsx/.csv wajib diunggah" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}$/.test(periodeBulan)) {
    return Response.json({ error: "periode_bulan wajib format YYYY-MM (cth: 2026-09)" }, { status: 400 });
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

  let headerIdx = aoa.findIndex((r) =>
    (r || []).some((c) => {
      const v = String(c || "").toLowerCase().replace(/\s+/g, " ").trim();
      return v === "nama karyawan" || v === "nama";
    })
  );
  if (headerIdx < 0) {
    return Response.json({ error: "Baris header Nama Karyawan tidak ditemukan" }, { status: 400 });
  }
  const headers = aoa[headerIdx].map((c) => String(c ?? ""));
  const rows = aoa.slice(headerIdx + 1).filter((r) => (r || []).some((c) => String(c ?? "").trim() !== ""));

  const { payrolls } = mapPayrollRows(headers, rows, periodeBulan);
  if (payrolls.length === 0) {
    return Response.json({ error: "Tidak ada baris payroll valid" }, { status: 400 });
  }

  // Cek nama yang belum ada di master (salah ketik / beda ejaan).
  const keys = payrolls.map((p) => p.nama_key);
  const { data: existing } = await supabaseAdmin.from("employees").select("nama_key").in("nama_key", keys);
  const existingSet = new Set((existing || []).map((e) => e.nama_key));
  const unmatched = payrolls.filter((p) => !existingSet.has(p.nama_key)).map((p) => p.nama_asli);

  const payload = payrolls
    .filter((p) => existingSet.has(p.nama_key))
    .map((p) => ({ ...p, updated_at: new Date().toISOString() }));

  if (payload.length > 0) {
    const { error } = await supabaseAdmin.from("payroll_latest").upsert(payload, { onConflict: "nama_key" });
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
  }

  return Response.json({
    success: true,
    total: payrolls.length,
    matched: payload.length,
    unmatched,
    periode_bulan: periodeBulan,
    note: unmatched.length > 0 ? `${unmatched.length} nama tidak cocok dengan master (cek ejaan)` : undefined,
  });
}
