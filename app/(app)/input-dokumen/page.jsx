import { auth } from "@/auth";
import { documentConfigs } from "@/lib/document-configs";
import { DocumentCard } from "@/components/DocumentCard";
import { LogOut } from "lucide-react";
import { signOut } from "@/auth";

export default async function DashboardPage() {
  const session = await auth();

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Input Dokumen</h1>
          <p className="text-slate-500 mt-1">Pilih jenis dokumen yang ingin Anda buat.</p>
        </div>
        
        <div className="flex items-center space-x-4 bg-white px-4 py-2 rounded-xl shadow-sm border border-slate-100">
          <div className="text-right hidden md:block">
            <p className="text-sm font-semibold text-slate-900">{session?.user?.name}</p>
            <p className="text-xs text-slate-500">{session?.user?.email}</p>
          </div>
          {session?.user?.image && (
            <img src={session.user.image} alt="User" className="w-10 h-10 rounded-full border-2 border-slate-100" />
          )}
          <div className="w-px h-8 bg-slate-200 mx-2"></div>
          <form
            action={async () => {
              "use server";
              await signOut();
            }}
          >
            <button type="submit" className="text-slate-400 hover:text-red-500 transition-colors p-2 rounded-lg hover:bg-red-50" title="Keluar">
              <LogOut className="w-5 h-5" />
            </button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {documentConfigs.map((config) => (
          <DocumentCard key={config.id} config={config} />
        ))}
      </div>
    </div>
  );
}
