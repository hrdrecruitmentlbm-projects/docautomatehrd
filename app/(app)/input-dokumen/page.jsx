import { documentConfigs } from "@/lib/document-configs";
import { DocumentCard } from "@/components/DocumentCard";

export default async function DashboardPage() {
  // Header, user chip, and logout moved to the app shell (TopBar avatar menu).
  // This page keeps its own <h1> until Phase 2 (headerMode: "page").
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Input Dokumen</h1>
        <p className="text-slate-500 mt-1">Pilih jenis dokumen yang ingin Anda buat.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {documentConfigs.map((config) => (
          <DocumentCard key={config.id} config={config} />
        ))}
      </div>
    </div>
  );
}
