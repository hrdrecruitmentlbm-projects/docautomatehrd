// Modul ekstraksi data PKWT dari nama file dan isi dokumen Google Drive.
// Dibuat murni dan toleran terhadap variasi penamaan dan penulisan klausul kontrak.

import { normalizeName, normalizeLiniBisnis, BULAN_ID } from "./pkwt.js";

const MONTH_MAP = {
  januari: 1, jan: 1,
  februari: 2, feb: 2,
  maret: 3, mar: 3,
  april: 4, apr: 4,
  mei: 5, may: 5,
  juni: 6, jun: 6,
  juli: 7, jul: 7,
  agustus: 8, agu: 8, ags: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  oktober: 10, okt: 10, oct: 10,
  november: 11, nov: 11,
  desember: 12, des: 12, dec: 12,
};

/**
 * Mengubah string tanggal Indonesia (mis. "5 November 2026" atau "01-10-2026")
 * menjadi format standar ISO "YYYY-MM-DD".
 */
export function parseIndonesianDate(input) {
  if (!input) return null;
  const s = String(input).trim();

  // Format teks: "5 November 2026" atau "05 Nov 2026"
  const textMatch = s.match(/(\d{1,2})\s+([A-Za-z]{3,})\s+(20\d{2})/);
  if (textMatch) {
    const day = parseInt(textMatch[1], 10);
    const monthKey = textMatch[2].toLowerCase();
    const year = parseInt(textMatch[3], 10);
    const month = MONTH_MAP[monthKey];
    if (month && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // Format numerik: "DD/MM/YYYY" atau "DD-MM-YYYY"
  const numMatch = s.match(/(\d{1,2})[/-](\d{1,2})[/-](20\d{2})/);
  if (numMatch) {
    const day = parseInt(numMatch[1], 10);
    const month = parseInt(numMatch[2], 10);
    const year = parseInt(numMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  // Format ISO: "YYYY-MM-DD"
  const isoMatch = s.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  return null;
}

/**
 * Menghitung selisih bulan antara dua tanggal ISO ("YYYY-MM-DD")
 */
export function calculateMonthsDiff(startIso, endIso) {
  if (!startIso || !endIso) return null;
  const dStart = new Date(startIso);
  const dEnd = new Date(endIso);
  if (isNaN(dStart.getTime()) || isNaN(dEnd.getTime())) return null;

  const years = dEnd.getFullYear() - dStart.getFullYear();
  const months = dEnd.getMonth() - dStart.getMonth();
  const days = dEnd.getDate() - dStart.getDate();

  let totalMonths = years * 12 + months;
  // Jika hari berakhir mendekati akhir bulan (mis. 1 Nov sd 31 Okt = 12 bulan)
  if (days >= 25 || days <= -25) {
    totalMonths += 1;
  }
  return totalMonths > 0 ? totalMonths : 1;
}

/**
 * Ekstraksi nomor surat, nama karyawan, dan kode perusahaan dari nama file Drive.
 * Toleran terhadap variasi garis miring (/), garis bawah (_), atau spasi.
 */
export function extractDocNumberAndName(fileName, parentFolder = "") {
  let raw = String(fileName || "")
    .replace(/\.gdoc$/i, "")
    .trim();

  // Hapus prefix tanggal/catatan manual di depan jika ada (mis. "24/9 00236_ ...")
  raw = raw.replace(/^\d{1,2}\/\d{1,2}\s+/, "");

  let nomorSurat = "";
  let namaKaryawan = "";
  let kodePerusahaan = "";

  // Pola A: Format standar: {NOMOR SURAT}_{NAMA}
  // Contoh: "00248/SPK/HRD-NUMETA/INT.5/X/2026_Ayunda Praagustiana"
  // atau "00248/ SPK/HRD-NUMETA/INT.5/X/2026_Ayunda Praagustiana"
  // atau "00016_ SPK_HRD-MJO_INT.23_IX_2026 - Anindya Putri"
  const standardPattern = /([0-9]{3,6}\s*[/_]\s*(?:SPK|PKWT)\s*[/_]\s*HRD-[A-Za-z0-9 _.-]+?\s*[/_]\s*INT[A-Za-z0-9._/-]+)(?:[\s_-]+)(.+)/i;
  const mStandard = raw.match(standardPattern);

  if (mStandard) {
    nomorSurat = mStandard[1]
      .replace(/\s*\/\s*/g, "/")
      .replace(/\s+/g, " ")
      .trim();
    namaKaryawan = mStandard[2]
      .replace(/^[_-]+\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
  } else if (raw.includes("_")) {
    // Pola B: Pemisahan sederhana dengan garis bawah
    const parts = raw.split("_");
    const potentialNum = parts[0].trim();
    if (potentialNum.includes("SPK") || potentialNum.includes("HRD")) {
      nomorSurat = potentialNum;
      namaKaryawan = parts.slice(1).join(" ").trim();
    } else {
      namaKaryawan = parts[parts.length - 1].trim();
      nomorSurat = parts.slice(0, -1).join("/").trim();
    }
  } else if (raw.includes(" - ")) {
    // Pola C: Pemisahan dengan strip " - "
    const parts = raw.split(" - ");
    nomorSurat = parts[0].trim();
    namaKaryawan = parts.slice(1).join(" ").trim();
  } else {
    nomorSurat = raw;
    namaKaryawan = "";
  }

  // Bersihkan nama dari sisa-sisa nomor / ekstensi
  namaKaryawan = namaKaryawan.replace(/\.(docx?|pdf)$/i, "").trim();

  // Ekstraksi kode perusahaan dari nomor surat (mis. HRD-NUMETA -> NUMETA)
  const compMatch = nomorSurat.match(/HRD-([A-Za-z0-9][A-Za-z0-9 _.-]*?)(?=[/_]|$)/i);
  if (compMatch) {
    kodePerusahaan = normalizeLiniBisnis(compMatch[1]);
  } else if (parentFolder) {
    // Cadangan: nama folder terdekat
    kodePerusahaan = normalizeLiniBisnis(parentFolder);
  }

  return {
    nomor_surat: nomorSurat || null,
    nama_asli: namaKaryawan || null,
    nama_key: namaKaryawan ? normalizeName(namaKaryawan) : null,
    kode_perusahaan: kodePerusahaan || null,
  };
}

/**
 * Ekstraksi bulan arsip dari rantai nama folder (dari bawah ke atas).
 * Contoh: "September 2026" atau "2026-09"
 */
export function extractMonthFromFolderChain(folderChain = []) {
  const bulanRegex = new RegExp(
    `(${BULAN_ID.join("|")})\\s+(20\\d{2})`,
    "i"
  );

  // Telusuri dari folder terdekat ke atas
  for (let i = folderChain.length - 1; i >= 0; i--) {
    const fName = String(folderChain[i] || "").trim();
    const m = fName.match(bulanRegex);
    if (m) {
      const bNama = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
      return `${bNama} ${m[2]}`;
    }
    const isoM = fName.match(/(20\d{2})[-_/](\d{1,2})/);
    if (isoM) {
      const y = isoM[1];
      const mIdx = parseInt(isoM[2], 10);
      if (mIdx >= 1 && mIdx <= 12) {
        return `${BULAN_ID[mIdx - 1]} ${y}`;
      }
    }
  }

  return null;
}

/**
 * Ekstraksi tanggal mulai, tanggal berakhir, dan jangka waktu dari isi teks dokumen PKWT.
 * Mencari kalimat "terhitung mulai tanggal ... sampai dengan ...".
 */
export function extractDatesFromContractText(text) {
  if (!text) {
    return {
      tanggal_mulai: null,
      tanggal_berakhir: null,
      jangka_bulan: null,
      found: false,
      error: "Isi teks dokumen kosong atau tidak dapat dibaca",
    };
  }

  // Normalisasi spasi dan line breaks
  const cleanText = String(text).replace(/\s+/g, " ");

  // Pola 1: Standar Indonesia "terhitung mulai tanggal ... sampai dengan ... (tanggal) ..."
  // Toleran terhadap: "terhitung mulai dari tanggal", "s/d", "sampai", dsb.
  const pattern1 = /terhitung\s+mulai\s+(?:dari\s+)?tanggal\s+([0-9]{1,2}\s+[A-Za-z]{3,}\s+20\d{2}|[0-9]{1,2}[/-][0-9]{1,2}[/-]20\d{2})\s*(?:s\/d|sampai(?:\s+dengan)?)\s+(?:tanggal\s+)?([0-9]{1,2}\s+[A-Za-z]{3,}\s+20\d{2}|[0-9]{1,2}[/-][0-9]{1,2}[/-]20\d{2})/i;
  const m1 = cleanText.match(pattern1);

  if (m1) {
    const startIso = parseIndonesianDate(m1[1]);
    const endIso = parseIndonesianDate(m1[2]);

    if (startIso && endIso) {
      // Cari juga penulisan eksplisit durasi bulan jika ada: "selama X bulan"
      let durasi = calculateMonthsDiff(startIso, endIso);
      const durasiMatch = cleanText.match(/(?:jangka\s+waktu|selama)\s+(\d{1,2})\s*(?:\([a-zA-Z\s]+\))?\s*bulan/i);
      if (durasiMatch) {
        durasi = parseInt(durasiMatch[1], 10);
      }

      return {
        tanggal_mulai: startIso,
        tanggal_berakhir: endIso,
        jangka_bulan: durasi,
        found: true,
        clause: m1[0],
      };
    }
  }

  // Pola 2: Variasi "berlaku dari tanggal ... sampai tanggal ..."
  const pattern2 = /berlaku\s+(?:dari|sejak)\s+tanggal\s+([0-9]{1,2}\s+[A-Za-z]{3,}\s+20\d{2})\s*(?:s\/d|sampai(?:\s+dengan)?)\s+(?:tanggal\s+)?([0-9]{1,2}\s+[A-Za-z]{3,}\s+20\d{2})/i;
  const m2 = cleanText.match(pattern2);
  if (m2) {
    const startIso = parseIndonesianDate(m2[1]);
    const endIso = parseIndonesianDate(m2[2]);
    if (startIso && endIso) {
      return {
        tanggal_mulai: startIso,
        tanggal_berakhir: endIso,
        jangka_bulan: calculateMonthsDiff(startIso, endIso),
        found: true,
        clause: m2[0],
      };
    }
  }

  return {
    tanggal_mulai: null,
    tanggal_berakhir: null,
    jangka_bulan: null,
    found: false,
    error: "Kalimat 'terhitung mulai tanggal ... sampai dengan ...' tidak ditemukan dalam teks dokumen",
  };
}
