import { DOKUMEN_STATUS, STATE_KONTRAK, stateKontrak } from "@/lib/contract-lifecycle";
import { cn } from "@/lib/utils";

/**
 * Lencana status untuk satu baris dokumen.
 * Dua konsep dipisah: siklus administratif (Draf/Dikirim) dan posisi masa
 * kontrak terhadap hari ini (Aktif/Segera/Kedaluwarsa). Keduanya boleh
 * tampil bersamaan — kontrak "Ditandatangani" bisa saja sudah kedaluwarsa.
 */

export function StatusBadge({ status, className }) {
  const meta = DOKUMEN_STATUS[status] || DOKUMEN_STATUS.draft;
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-xs font-medium",
        meta.className,
        className
      )}
    >
      {meta.label}
    </span>
  );
}

export function ContractStateBadge({ tanggalBerakhir, now, className }) {
  const state = tanggalBerakhir === null || tanggalBerakhir === undefined
    ? STATE_KONTRAK.terbuka
    : stateKontrak(tanggalBerakhir, now);
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-xs font-medium",
        state.className,
        className
      )}
    >
      {state.label}
    </span>
  );
}

/** Versi ringkas untuk kolom sempit: "≤ 30 hari" alih-alih "Segera berakhir". */
export function ContractStateDot({ tanggalBerakhir, now, className }) {
  const state = stateKontrak(tanggalBerakhir, now);
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-text-2", className)}>
      <span className={cn("size-2 shrink-0 rounded-full", state.dot)} aria-hidden="true" />
      {state.short}
    </span>
  );
}
