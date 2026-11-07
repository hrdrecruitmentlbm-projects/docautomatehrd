import { PkwtCorrectionsTable } from "@/components/PkwtCorrectionsTable";

export const dynamic = "force-dynamic";

export default function PerluDicekPage() {
  return (
    <div className="max-w-5xl space-y-4">
      <p className="text-sm text-text-2 sm:hidden">
        Verifikasi manual tanggal mulai dan tanggal berakhir untuk dokumen PKWT arsip.
      </p>

      <div className="overflow-hidden rounded-lg border border-border bg-surface-1">
        <PkwtCorrectionsTable />
      </div>
    </div>
  );
}
