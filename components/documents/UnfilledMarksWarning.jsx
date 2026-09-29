import { TriangleAlert } from "lucide-react";

/**
 * Peringatan penanda {{…}} yang tidak terisi otomatis.
 *
 * Ini bukan "error" — dokumen sudah berhasil dibuat dan ada di Drive.
 * Ini memberitahu bahwa ada bagian kontrak yang masih berupa teks mentah
 * seperti {{t_kesehatan}}, yang HARUS diperbaiki manual sebelum defaultdict
 * ke karyawan.
 *
 * Blok, bukan toast: toast hilang dalam 4 detik, kontrak ini dibaca bertahun-tahun.
 */
export function UnfilledMarksWarning({ marks, verifiedAt, docUrl, compact = false }) {
  if (!marks || marks.length === 0) return null;

  return (
    <div
      role="alert"
      className="rounded-md border border-amber-300 bg-amber-50 p-3.5 text-sm"
    >
      <p className="flex items-center gap-2 font-semibold text-amber-900">
        <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
        {marks.length} penanda belum terisi otomatis
      </p>
      <p className="mt-1 text-amber-800">
        Bagian kontrak ini masih berupa teks mentah dan harus diisi manual
        sebelum defaultdict ke karyawan.
      </p>

      <ul className="mt-2.5 flex flex-wrap gap-1.5">
        {marks.map((m) => (
          <li
            key={m}
            className="rounded border border-amber-300 bg-white px-1.5 py-0.5 font-mono text-xs text-amber-900"
          >
            {`{{${m}}}`}
          </li>
        ))}
      </ul>

      {!compact && (
        <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-amber-800">
          {verifiedAt && (
            <span>
              Diperiksa{" "}
              {new Date(verifiedAt).toLocaleString("id-ID", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
          {docUrl && (
            <a
              href={docUrl}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-amber-900 underline underline-offset-2"
            >
              Perbaiki di Google Docs
            </a>
          )}
        </p>
      )}
    </div>
  );
}
