import { getDocumentConfig } from "@/lib/document-configs";
import { DynamicForm } from "@/components/DynamicForm";
import { PkwtAutoForm } from "@/components/PkwtAutoForm";
import { PaklaringAutoForm } from "@/components/PaklaringAutoForm";
import { redirect } from "next/navigation";

// headerMode is "shell" for /generate/* (route-meta): the TopBar owns this
// route's single <h1> and its back link (-> /input-dokumen). The page must
// render NO <h1> and no second back affordance (one-h1 / one-back invariant).
// The per-type helper copy stays in-page as a section intro under the shell
// title, because subtitles hidden on mobile must not carry the only copy.

// Jenis dengan form otomatis: datanya diambil dari master, jadi DynamicForm
// (yang butuh semua field di ketik manual) tidak boleh dipakai untuk ini.
const AUTO_FORMS = {
  pkwt: { Form: PkwtAutoForm, intro: "Ketik nama karyawan, data personal, payroll, dan perusahaan terisi otomatis." },
  paklaring: {
    Form: PaklaringAutoForm,
    intro: "Ketik nama karyawan, data personal, dan perusahaan terisi otomatis.",
  },
};

export default async function GenerateDocumentPage({ params }) {
  const resolvedParams = await params;
  const type = resolvedParams.type;
  const config = getDocumentConfig(type);

  if (!config) {
    redirect('/dashboard');
  }

  const auto = AUTO_FORMS[type];

  return (
    <div className="max-w-4xl mx-auto">
      <p className="mb-6 text-sm text-text-2">
        {auto ? auto.intro : config.description}
      </p>

      {auto ? <auto.Form /> : <DynamicForm config={config} />}
    </div>
  );
}
