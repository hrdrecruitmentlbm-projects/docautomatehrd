import { Suspense } from "react";
import BulkGenerator from "@/components/register/BulkGenerator";

/**
 * Pembuatan massal PKWT.
 *
 * /generate/[type] adalah anak dari Documents, jadi /generate/bulk ikut
 * meneruskan pencahayaan "shell" yang sama: TopBar memegang satu-satunya
 * <h1> dan tombol kembali ke Register Kontrak (lihat lib/route-meta.js).
 *
 * Suspense wajib: BulkGenerator memakai useSearchParams() untuk membaca
 * daftar nama key dari ?keys=.
 */
export default function BulkPage() {
  return (
    <Suspense
      fallback={
        <div className="rounded-lg border border-border bg-surface-1 p-6">
          <div className="skeleton h-5 w-48 rounded motion-reduce:animate-none" aria-hidden="true" />
          <div className="mt-3 skeleton h-3.5 w-72 rounded motion-reduce:animate-none" aria-hidden="true" />
          <p className="sr-only" role="status">Memuat pilihan karyawan...</p>
        </div>
      }
    >
      <BulkGenerator />
    </Suspense>
  );
}
