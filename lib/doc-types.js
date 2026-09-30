// Satu-satunya tempat metadata jenis dokumen didefinisikan.
//
// SEBELUM file ini ada, warna + label tiap jenis diduplikasi di tujuh file
// (hub, rincian, history, search, dashboard, settings, form). Menambah jenis
// kelima berarti seventh copy-paste — dan ketujuhnyalah yang paling sering
// terlupa, hasilnya badge abu-abu diam-diam di satu halaman saja.
//
// TUJUH: nilai di sini HARUS sama persis dengan nilai yang tadinya di-hardcode
// di tiap file. Ini substitusi murni, bukan redesign — kalau ada warna yang
// berubah, itu regresi.
//
// Field:
//   label        teks yang tampil (badge, filter, heading)
//   tile         kelas badge: latar + teks
//   dot          kelas titik solid (legend, strip folder, donut)
//   isContract   punya masa kontrak -> tampilkan ContractStateDot.
//                FALSE untuk Paklaring: masa kontraknya sudah SELESAI saat
//                surat keluar, jadi "Kedaluwarsa" hanya menambah kebingungan.
//   canDuplicate tombol "Buat Salinan" (perpanjangan) hanya untuk kontrak.
//   hasPayroll   form butuh data gaji. Paklaring tidak: isian-about-gaji di
//                surat keterangan kerja tidak ada, jadi jangan query payroll.

export const DOC_TYPES = {
  pkwt: {
    label: "PKWT",
    tile: "bg-emerald-100 text-emerald-700",
    dot: "bg-primary",
    isContract: true,
    canDuplicate: true,
    hasPayroll: true,
  },
  paklaring: {
    label: "Paklaring",
    tile: "bg-sky-100 text-sky-700",
    dot: "bg-sky-600",
    isContract: false,
    canDuplicate: false,
    hasPayroll: false,
  },
  sk: {
    label: "SK",
    tile: "bg-amber-100 text-amber-700",
    dot: "bg-amber-600",
    isContract: false,
    canDuplicate: false,
    hasPayroll: false,
  },
  memo: {
    label: "Memo",
    tile: "bg-slate-100 text-slate-700",
    dot: "bg-slate-500",
    isContract: false,
    canDuplicate: false,
    hasPayroll: false,
  },
  sp: {
    label: "SP",
    tile: "bg-red-100 text-red-700",
    dot: "bg-red-600",
    isContract: false,
    canDuplicate: false,
    hasPayroll: false,
  },
};

// Urutan tampil di hub, history, dan palette pencarian. Menambah entri di
// sini = jenis itu muncul di semua tempat sekaligus.
export const DOC_TYPE_ORDER = ["pkwt", "paklaring", "sk", "memo", "sp"];

// Badge netral untuk jenis yang tidak dikenal (log lama, template lain, atau
// typo). Dipakai uniform supaya tidak ada halaman yang crash di TypeError.
const UNKNOWN = {
  label: "Dokumen",
  tile: "bg-surface-3 text-text-2",
  dot: "bg-slate-400",
  isContract: false,
  canDuplicate: false,
  hasPayroll: false,
};

/**
 * Metadata untuk satu jenis dokumen. Tidak pernah melempar error: jenis yang
 * tidak dikenal mendapat badge netral, bukan `undefined` yang akan membuat
 * `meta.tile` meledak saat render.
 */
export function docTypeMeta(type) {
  const key = String(type || "").toLowerCase().trim();
  return DOC_TYPES[key] || { ...UNKNOWN, label: type || UNKNOWN.label };
}

/** true kalau jenis ini punya masa kontrak yang perlu dipantau. */
export function isContractType(type) {
  return docTypeMeta(type).isContract;
}

/** true kalau jenis ini boleh memakai "Buat Salinan". */
export function canDuplicateType(type) {
  return docTypeMeta(type).canDuplicate;
}

/** Daftar [key, meta] sesuai urutan tampil — untuk map() di UI. */
export function docTypeEntries() {
  return DOC_TYPE_ORDER.map((t) => [t, DOC_TYPES[t]]);
}
