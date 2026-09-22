import { auth } from "@/auth";
import { syncMasterAoa } from "@/lib/sync";
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

  try {
    const result = await syncMasterAoa(aoa, sheetName);
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
}
