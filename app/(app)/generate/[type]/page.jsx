import { getDocumentConfig } from "@/lib/document-configs";
import { DynamicForm } from "@/components/DynamicForm";
import { PkwtAutoForm } from "@/components/PkwtAutoForm";
import { redirect } from "next/navigation";

// headerMode is "shell" for /generate/* (route-meta): the TopBar owns this
// route's single <h1> and its back link (-> /input-dokumen). The page must
// render NO <h1> and no second back affordance (one-h1 / one-back invariant).
// The per-type helper copy stays in-page as a section intro under the shell
// title, because subtitles hidden on mobile must not carry the only copy.
export default async function GenerateDocumentPage({ params }) {
  const resolvedParams = await params;
  const config = getDocumentConfig(resolvedParams.type);

  if (!config) {
    redirect('/dashboard');
  }

  return (
    <div className="max-w-4xl mx-auto">
      <p className="mb-6 text-sm text-text-2">
        {resolvedParams.type === "pkwt"
          ? "Ketik nama karyawan, data personal, payroll, dan perusahaan terisi otomatis."
          : config.description}
      </p>

      {resolvedParams.type === "pkwt" ? <PkwtAutoForm /> : <DynamicForm config={config} />}
    </div>
  );
}
