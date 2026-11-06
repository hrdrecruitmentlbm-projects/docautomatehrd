import { supabaseAdmin, friendlyDbError } from "./supabase";
import { getUnifiedContracts } from "./pkwt-unified";
import { daysUntil, toIsoDate, formatIsoId } from "./contract-lifecycle";

/**
 * Menghitung daftar kontrak PKWT yang perlu ditindaklanjuti untuk notifikasi di dalam aplikasi.
 *
 * Aturan Bisnis (TAHAP 6):
 * 1. Menghasilkan 3 kelompok:
 *    - "Berakhir dalam 7 hari" (sisa_hari >= 0 dan <= 7)
 *    - "Berakhir dalam 30 hari" (sisa_hari > 7 dan <= 30)
 *    - "Sudah berakhir dan belum diperpanjang" (sisa_hari < 0)
 * 2. Dianggap sudah ditangani bila karyawan tersebut memiliki kontrak PKWT lain
 *    dengan tanggal_mulai setelah tanggal_berakhir kontrak lama (notifikasi hilang otomatis).
 * 3. Kontrak yang sedang ditunda (snoozed_until > now) di tabel pkwt_notif_state
 *    tidak dimasukkan ke dalam daftar aktif.
 *
 * @param {Object} [options]
 * @param {Date|string|number} [options.now=new Date()]
 * @param {string} [options.userEmail]
 */
export async function getContractNotifications({ now = new Date(), userEmail = null } = {}) {
  const refDate = now instanceof Date ? now : new Date(now);
  const nowIso = refDate.toISOString();

  // 1. Ambil semua kontrak terpadu (document_logs + pkwt_source deduplicated)
  const unified = await getUnifiedContracts({ limit: 0, now: refDate });
  const allContracts = unified?.data || [];

  // 2. Ambil data status tunda (snooze) yang masih berlaku
  const snoozedSet = new Set();
  try {
    const { data: snoozeRows, error: snoozeError } = await supabaseAdmin
      .from("pkwt_notif_state")
      .select("nama_key, tanggal_berakhir, snoozed_until")
      .gt("snoozed_until", nowIso);

    if (!snoozeError && Array.isArray(snoozeRows)) {
      for (const row of snoozeRows) {
        if (row.nama_key && row.tanggal_berakhir) {
          snoozedSet.add(`${row.nama_key}|${row.tanggal_berakhir}`);
        }
      }
    } else if (snoozeError) {
      // Jika tabel belum dibuat, jangan menjatuhkan layout
      console.warn("Info pkwt_notif_state:", friendlyDbError(snoozeError));
    }
  } catch (err) {
    console.warn("Gagal membaca pkwt_notif_state:", err?.message);
  }

  // 3. Kelompokkan semua kontrak per karyawan (nama_key) untuk cek apakah sudah ditangani
  const contractsByEmployee = new Map();
  for (const c of allContracts) {
    if (!c.nama_key) continue;
    if (!contractsByEmployee.has(c.nama_key)) {
      contractsByEmployee.set(c.nama_key, []);
    }
    contractsByEmployee.get(c.nama_key).push(c);
  }

  // 4. Evaluasi setiap kontrak
  const items7 = [];
  const items30 = [];
  const itemsExpired = [];

  const seenKeys = new Set();

  for (const c of allContracts) {
    const namaKey = c.nama_key;
    const endIso = toIsoDate(c.tanggal_berakhir);

    // Abaikan jika tidak memiliki tanggal berakhir atau nama_key
    if (!namaKey || !endIso) continue;

    // Hindari duplikasi item notifikasi
    const dedupeKey = `${namaKey}|${endIso}`;
    if (seenKeys.has(dedupeKey)) continue;

    // Cek apakah notifikasi untuk kontrak ini sedang ditunda (snoozed)
    if (snoozedSet.has(dedupeKey)) continue;

    // ATURAN 3: Cek apakah kontrak ini sudah ditangani oleh kontrak perpanjangan
    // Dianggap sudah ditangani bila karyawan memiliki PKWT dengan tanggal_mulai setelah tanggal_berakhir kontrak ini
    const empContracts = contractsByEmployee.get(namaKey) || [];
    const isHandled = empContracts.some((other) => {
      if (!other.tanggal_mulai) return false;
      const otherStartIso = toIsoDate(other.tanggal_mulai);
      if (!otherStartIso) return false;

      // Perpanjangan: tanggal_mulai >= tanggal_berakhir kontrak lama dan bukan baris kontrak yang persis sama
      return otherStartIso > endIso || (otherStartIso >= endIso && other.id !== c.id);
    });

    if (isHandled) {
      // Kontrak ini sudah diperpanjang / ditangani -> notifikasi hilang otomatis
      continue;
    }

    seenKeys.add(dedupeKey);

    const sisa = typeof c.sisa_hari === "number" ? c.sisa_hari : daysUntil(endIso, refDate);
    if (sisa === null) continue;

    // Siapkan rekomendasi tanggal mulai untuk kontrak perpanjangan (H+1 dari tanggal berakhir)
    let nextStart = "";
    try {
      const d = new Date(`${endIso}T00:00:00`);
      d.setDate(d.getDate() + 1);
      nextStart = isNaN(d) ? "" : d.toISOString().slice(0, 10);
    } catch {
      nextStart = "";
    }

    const item = {
      id: c.id,
      nama_asli: c.nama_asli || namaKey,
      nama_key: namaKey,
      nomor_surat: c.nomor_surat || "-",
      kode_perusahaan: c.kode_perusahaan || c.lini_bisnis || "-",
      tanggal_mulai: c.tanggal_mulai || null,
      tanggal_berakhir: endIso,
      tanggal_berakhir_id: formatIsoId(endIso),
      sisa_hari: sisa,
      url: c.url || null,
      sumber: c.sumber,
      next_start: nextStart,
    };

    if (sisa < 0) {
      // Sudah lewat tanggal berakhir
      itemsExpired.push(item);
    } else if (sisa <= 7) {
      // Berakhir dalam 7 hari
      items7.push(item);
    } else if (sisa <= 30) {
      // Berakhir dalam 30 hari
      items30.push(item);
    }
  }

  // Pengurutan tiap kelompok:
  // - 7 hari: paling mendesak dulu (sisa_hari ascending: 0, 1, 2, ...)
  items7.sort((a, b) => a.sisa_hari - b.sisa_hari);
  // - 30 hari: paling mendesak dulu (sisa_hari ascending: 8, 9, ...)
  items30.sort((a, b) => a.sisa_hari - b.sisa_hari);
  // - Sudah berakhir: yang paling baru berakhir di atas (tanggal_berakhir descending)
  itemsExpired.sort((a, b) => b.tanggal_berakhir.localeCompare(a.tanggal_berakhir));

  const total = items7.length + items30.length + itemsExpired.length;

  return {
    total,
    counts: {
      h7: items7.length,
      h30: items30.length,
      expired: itemsExpired.length,
      total,
    },
    items: {
      h7: items7,
      h30: items30,
      expired: itemsExpired,
    },
    updatedAt: nowIso,
  };
}

/**
 * Menunda notifikasi kontrak tertentu selama N hari (default 7 hari).
 * Menyimpan status ke tabel pkwt_notif_state secara idempotent.
 */
export async function snoozeContractNotification({
  nama_key,
  tanggal_berakhir,
  user_email = null,
  days = 7,
}) {
  if (!nama_key || !tanggal_berakhir) {
    throw new Error("nama_key dan tanggal_berakhir wajib diisi");
  }

  const cleanKey = String(nama_key).trim();
  const cleanEnd = toIsoDate(tanggal_berakhir) || String(tanggal_berakhir).trim();

  // Hitung waktu selesai tunda (now + N hari)
  const snoozedUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("pkwt_notif_state")
    .upsert(
      {
        nama_key: cleanKey,
        tanggal_berakhir: cleanEnd,
        snoozed_until: snoozedUntil,
        user_email: user_email || null,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "nama_key,tanggal_berakhir",
      }
    )
    .select()
    .single();

  if (error) {
    console.error("Gagal menyimpan tunda notifikasi:", error);
    throw new Error(friendlyDbError(error));
  }

  return {
    success: true,
    data,
    snoozed_until: snoozedUntil,
  };
}
