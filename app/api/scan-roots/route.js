import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { extractFolderId, isValidGoogleId } from "@/lib/sheets";

const DEFAULT_EXCLUSIONS = ["Paklaring", "SLIP EMAIL", "Template", "KOP", "ttd"];

export async function GET() {
  const session = await auth();
  if (session?.error) {
    return Response.json({ error: "Sesi Google berakhir, silakan login ulang" }, { status: 401 });
  }
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Ambil daftar root folder dari database
  const { data: dbRoots, error: rootsError } = await supabaseAdmin
    .from("pkwt_scan_roots")
    .select("*")
    .order("id", { ascending: true });

  let roots = dbRoots || [];

  // Jika tabel belum ada datanya, ambil nilai awal dari pkwt_folder_id yang ada di settings / company_map
  if (roots.length === 0) {
    const initialCandidates = [];

    // Cek settings user
    const { data: settings } = await supabaseAdmin
      .from("settings")
      .select("pkwt_folder_id")
      .eq("user_email", session.user.email)
      .maybeSingle();

    if (settings?.pkwt_folder_id) {
      const clean = extractFolderId(settings.pkwt_folder_id);
      if (clean && isValidGoogleId(clean)) {
        initialCandidates.push({
          label: "HRIS PKWT (Settings)",
          folder_id: clean,
          aktif: true,
          mulai_dari_bulan: "",
        });
      }
    }

    // Cek company_map jika settings belum ada
    if (initialCandidates.length === 0) {
      const { data: mapRows } = await supabaseAdmin
        .from("company_map")
        .select("pkwt_folder_id, lini_bisnis")
        .not("pkwt_folder_id", "is", null)
        .limit(5);

      const seen = new Set();
      for (const m of mapRows || []) {
        const clean = extractFolderId(m.pkwt_folder_id);
        if (clean && isValidGoogleId(clean) && !seen.has(clean)) {
          seen.add(clean);
          initialCandidates.push({
            label: `HRIS PKWT (${m.lini_bisnis || "Arsip"})`,
            folder_id: clean,
            aktif: true,
            mulai_dari_bulan: "",
          });
        }
      }
    }

    // Default placeholder jika belum ada folder sama sekali
    if (initialCandidates.length === 0) {
      initialCandidates.push({
        label: "HRIS PKWT",
        folder_id: "",
        aktif: true,
        mulai_dari_bulan: "",
      });
    }

    roots = initialCandidates;
  }

  // 2. Ambil daftar pengecualian (exclusions)
  const { data: dbExclusions, error: excError } = await supabaseAdmin
    .from("pkwt_scan_exclusions")
    .select("id, pola")
    .order("id", { ascending: true });

  let exclusions = [];
  if (dbExclusions && dbExclusions.length > 0) {
    exclusions = dbExclusions.map((e) => e.pola);
  } else {
    exclusions = [...DEFAULT_EXCLUSIONS];
  }

  return Response.json({
    roots,
    exclusions,
    warning: rootsError ? rootsError.message : excError ? excError.message : null,
  });
}

export async function POST(req) {
  const session = await auth();
  if (session?.error) {
    return Response.json({ error: "Sesi Google berakhir, silakan login ulang" }, { status: 401 });
  }
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const rawRoots = body?.roots;
  const rawExclusions = body?.exclusions;

  if (!Array.isArray(rawRoots)) {
    return Response.json({ error: "roots wajib berupa array" }, { status: 400 });
  }

  // Validasi dan normalisasi tiap root
  const cleanedRoots = [];
  const seenFolderIds = new Set();

  for (let i = 0; i < rawRoots.length; i++) {
    const r = rawRoots[i];
    const label = String(r.label || "").trim();
    const rawFolder = String(r.folder_id || "").trim();

    if (!label) {
      return Response.json(
        { error: `Baris ke-${i + 1}: Label folder tidak boleh kosong` },
        { status: 400 }
      );
    }

    if (!rawFolder) {
      return Response.json(
        { error: `Baris "${label}": Folder ID atau URL tidak boleh kosong` },
        { status: 400 }
      );
    }

    const cleanFolderId = extractFolderId(rawFolder);
    if (!cleanFolderId || !isValidGoogleId(cleanFolderId)) {
      return Response.json(
        {
          error: `Baris "${label}": Folder ID atau URL tidak valid ("${rawFolder.slice(0, 100)}"). Pastikan format ID atau link Google Drive benar.`,
        },
        { status: 400 }
      );
    }

    if (seenFolderIds.has(cleanFolderId)) {
      return Response.json(
        { error: `Folder ID "${cleanFolderId}" duplikat pada baris "${label}"` },
        { status: 400 }
      );
    }
    seenFolderIds.add(cleanFolderId);

    const mulaiBulan = String(r.mulai_dari_bulan || "").trim() || null;

    cleanedRoots.push({
      ...(r.id ? { id: r.id } : {}),
      label,
      folder_id: cleanFolderId,
      aktif: r.aktif !== false,
      mulai_dari_bulan: mulaiBulan,
      updated_at: new Date().toISOString(),
    });
  }

  // Validasi dan normalisasi exclusions
  const cleanedExclusions = [];
  if (Array.isArray(rawExclusions)) {
    const seenPola = new Set();
    for (const item of rawExclusions) {
      const pola = String(typeof item === "string" ? item : item?.pola || "").trim();
      if (pola && !seenPola.has(pola.toLowerCase())) {
        seenPola.add(pola.toLowerCase());
        cleanedExclusions.push(pola);
      }
    }
  }

  // 1. Simpan roots ke tabel pkwt_scan_roots
  // Hapus baris yang tidak lagi ada di cleanedRoots
  const currentFolderIds = cleanedRoots.map((r) => r.folder_id);
  if (currentFolderIds.length > 0) {
    const { error: delError } = await supabaseAdmin
      .from("pkwt_scan_roots")
      .delete()
      .not("folder_id", "in", `(${currentFolderIds.map((id) => `"${id}"`).join(",")})`);

    if (delError) {
      console.warn("Gagal membersihkan baris root usang:", delError.message);
    }
  } else {
    await supabaseAdmin.from("pkwt_scan_roots").delete().neq("id", 0);
  }

  if (cleanedRoots.length > 0) {
    const { error: upsertError } = await supabaseAdmin
      .from("pkwt_scan_roots")
      .upsert(cleanedRoots, { onConflict: "folder_id" });

    if (upsertError) {
      return Response.json(
        { error: `Gagal menyimpan root folder: ${upsertError.message}` },
        { status: 500 }
      );
    }
  }

  // 2. Simpan exclusions ke tabel pkwt_scan_exclusions
  if (cleanedExclusions.length > 0) {
    // Hapus yang tidak lagi ada
    await supabaseAdmin
      .from("pkwt_scan_exclusions")
      .delete()
      .not("pola", "in", `(${cleanedExclusions.map((p) => `"${p}"`).join(",")})`);

    const exclusionPayload = cleanedExclusions.map((pola) => ({ pola }));
    const { error: excUpsertError } = await supabaseAdmin
      .from("pkwt_scan_exclusions")
      .upsert(exclusionPayload, { onConflict: "pola" });

    if (excUpsertError) {
      return Response.json(
        { error: `Gagal menyimpan pola pengecualian: ${excUpsertError.message}` },
        { status: 500 }
      );
    }
  } else {
    await supabaseAdmin.from("pkwt_scan_exclusions").delete().neq("id", 0);
  }

  return Response.json({
    success: true,
    totalRoots: cleanedRoots.length,
    totalExclusions: cleanedExclusions.length,
  });
}
