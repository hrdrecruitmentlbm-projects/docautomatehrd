import { documentConfigs } from "@/lib/document-configs";
import { DocumentCard } from "@/components/DocumentCard";

export default async function DashboardPage() {
  // headerMode: "shell" — the TopBar owns this route's single <h1> + subtitle.
  // Header/user/logout all live in the shell now.
  return (
    <div className="max-w-5xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {documentConfigs.map((config) => (
          <DocumentCard key={config.id} config={config} />
        ))}
      </div>
    </div>
  );
}
