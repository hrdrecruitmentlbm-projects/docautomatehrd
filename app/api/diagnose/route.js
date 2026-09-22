import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import {
  extractSpreadsheetId,
  getSheetTabs,
  isValidGoogleId,
  quoteTab,
  readRangeValues,
} from "@/lib/sheets";
import { findMasterHeaderIndex, upsertEmployees } from "@/lib/sync";
import { mapMasterRows } from "@/lib/spreadsheet";

// Diagnostics run the whole chain sequentially; give them room.
export const maxDuration = 60;

// GET /api/diagnose — run every link of the sync chain in isolation with a
// timer, so a failure names the broken step instead of "fetch failed".
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const rawUrl = searchParams.get("sheetUrl") || "";
  const tabParam = searchParams.get("tab") || "";
  const steps = [];

  const run = async (name, fn) => {
    const t0 = Date.now();
    try {
      const detail = await fn();
      steps.push({ name, ok: true, ms: Date.now() - t0, detail: detail || "" });
      return true;
    } catch (e) {
      steps.push({ name, ok: false, ms: Date.now() - t0, detail: e.message || String(e) });
      return false;
    }
  };

  // 1. Login session
  let session = null;
  await run("Sesi login & token Google", async () => {
    session = await auth();
    if (!session?.user?.email || !session.accessToken) {
      throw new Error("Belum login / token Google kedaluwarsa. Keluar lalu masuk kembali.");
    }
    return `${session.user.email} (token ada)`;
  });
  if (!session) return Response.json({ steps });

  // 2. Spreadsheet link
  let spreadsheetId = "";
  await run("Link spreadsheet valid", async () => {
    spreadsheetId = extractSpreadsheetId(rawUrl);
    if (!isValidGoogleId(spreadsheetId)) {
      throw new Error("Link tidak bisa dibaca. Tempel URL lengkap docs.google.com/spreadsheets/d/...");
    }
    return spreadsheetId;
  });
  if (!spreadsheetId) return Response.json({ steps });

  let tab = tabParam;

  // 3. Google Sheets API reachable (metadata)
  await run("Google Sheets API terjangkau", async () => {
    const tabs = await getSheetTabs(session.accessToken, spreadsheetId);
    if (tabs.length === 0) throw new Error("Sheet tidak punya tab.");
    if (!tab) tab = tabs[0].title;
    return `${tabs.length} tab: ${tabs.map((t) => t.title).join(", ").slice(0, 120)}`;
  });
  if (!tab) return Response.json({ steps });

  await run("Tab terpilih ada di file", async () => {
    const tabs = await getSheetTabs(session.accessToken, spreadsheetId);
    if (!tabs.some((t) => t.title === tab)) {
      throw new Error(`Tab "${tab}" tidak ada di file. Pilihan: ${tabs.map((t) => t.title).join(", ")}`);
    }
    return tab;
  });

  // 4. Tiny read
  await run("Baca kecil A1:F10", async () => {
    const rows = await readRangeValues(session.accessToken, spreadsheetId, `${quoteTab(tab)}!A1:F10`);
    if (rows.length === 0) throw new Error("Range kosong.");
    return `${rows.length} baris terbaca`;
  });

  // 5. Header block + mapping
  let headerRow = null;
  let headerIndex = 0;
  await run("Baca blok header A1:AZ80", async () => {
    const head = await readRangeValues(session.accessToken, spreadsheetId, `${quoteTab(tab)}!A1:AZ80`);
    const idx = findMasterHeaderIndex(head);
    if (idx < 0) throw new Error('Baris header "NAMA" tidak ada di 80 baris pertama.');
    headerRow = head[idx].map((c) => String(c ?? ""));
    headerIndex = idx + 1;
    return `header di baris ${headerIndex}, ${headerRow.filter(Boolean).length} kolom`;
  });
  if (!headerRow) return Response.json({ steps });

  // 6. Row count
  let totalRows = 0;
  await run("Hitung baris (kolom A)", async () => {
    const col = await readRangeValues(
      session.accessToken, spreadsheetId, `${quoteTab(tab)}!A${headerIndex + 1}:A2000`
    );
    totalRows = col.filter((r) => String(r[0] ?? "").trim() !== "").length;
    if (totalRows === 0) throw new Error("Tidak ada data di bawah header.");
    return `${totalRows} baris karyawan`;
  });

  // 7. One real chunk read (40 rows)
  let employees = [];
  await run("Baca satu chunk 40 baris", async () => {
    const start = headerIndex + 1;
    const rows = await readRangeValues(
      session.accessToken, spreadsheetId, `${quoteTab(tab)}!A${start}:AZ${start + 39}`
    );
    const nonEmpty = rows.filter((r) => r.some((c) => String(c ?? "").trim() !== ""));
    if (nonEmpty.length === 0) throw new Error("Chunk kosong.");
    const mapped = mapMasterRows(headerRow, nonEmpty);
    employees = mapped.employees;
    if (employees.length === 0) throw new Error("Mapping gagal: kolom NAMA tidak cocok.");
    return `${nonEmpty.length} baris -> ${employees.length} karyawan (contoh: ${employees[0].nama})`;
  });

  // 8. Database read
  await run("Database: baca tabel employees", async () => {
    const { data, error, count } = await supabaseAdmin
      .from("employees").select("nama_key", { count: "exact" }).limit(1);
    if (error) throw new Error(`${error.message} — jalankan supabase/pkwt-v2.sql bila tabel belum ada`);
    return `${count ?? data?.length ?? 0} baris saat ini`;
  });

  // 9. Database write round-trip (synthetic row, immediately removed)
  await run("Database: tulis + hapus (tes tulang punggung)", async () => {
    const probe = {
      nama_key: "__diagnosa__",
      nama: "DIAGNOSA",
      updated_at: new Date().toISOString(),
    };
    const { error: upErr } = await supabaseAdmin
      .from("employees").upsert(probe, { onConflict: "nama_key" });
    if (upErr) throw new Error(`upsert gagal: ${upErr.message}`);
    const { error: delErr } = await supabaseAdmin.from("employees").delete().eq("nama_key", "__diagnosa__");
    if (delErr) throw new Error(`delete gagal: ${delErr.message}`);
    return "upsert + delete OK";
  });

  // 10. Real upsert timing with the first chunk (the slowest write).
  // The rows written are genuine master data, so nothing to clean up here.
  if (employees.length > 0) {
    await run("Database: upsert 40 baris (durasi nyata)", async () => {
      await upsertEmployees(employees);
      return `${employees.length} baris terupsert (data asli, tidak perlu dihapus)`;
    });
  }

  return Response.json({ steps, tab, totalRows });
}
