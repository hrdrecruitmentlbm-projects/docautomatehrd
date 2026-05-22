import { getDocumentConfig } from "@/lib/document-configs";
import { DynamicForm } from "@/components/DynamicForm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { redirect } from "next/navigation";

export default async function GenerateDocumentPage({ params }) {
  const resolvedParams = await params;
  const config = getDocumentConfig(resolvedParams.type);

  if (!config) {
    redirect('/dashboard');
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <Link href="/dashboard" className="inline-flex items-center text-sm text-slate-500 hover:text-blue-600 transition-colors mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Kembali ke Dashboard
        </Link>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Buat {config.label}</h1>
        <p className="text-slate-500 mt-1">{config.description}</p>
      </div>

      <DynamicForm config={config} />
    </div>
  );
}
