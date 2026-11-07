import { ScanRootsForm } from "@/components/ScanRootsForm";

export const dynamic = "force-dynamic";

export default function SumberFolderPage() {
  return (
    <div className="max-w-5xl space-y-4">
      <p className="text-sm text-text-2 sm:hidden">
        Tentukan root folder Google Drive tempat dokumen PKWT disimpan dan kelola pemindaian arsip.
      </p>

      <div className="overflow-hidden rounded-lg border border-border bg-surface-1">
        <ScanRootsForm />
      </div>
    </div>
  );
}
