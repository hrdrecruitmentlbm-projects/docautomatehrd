import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { DashboardCharts } from "@/components/DashboardCharts";
import { FileText, FileSignature, FilePlus, Users } from "lucide-react";

export default async function NewDashboardPage() {
  const session = await auth();

  const { data: logs, error } = await supabaseAdmin
    .from('document_logs')
    .select('*')
    .order('created_at', { ascending: false });

  const totalDocs = logs?.length || 0;
  
  const pkwtCount = logs?.filter(l => l.document_type?.toLowerCase() === 'pkwt').length || 0;
  const skCount = logs?.filter(l => l.document_type?.toLowerCase() === 'sk').length || 0;
  
  // Unique creators
  const uniqueUsers = new Set(logs?.map(l => l.user_email)).size;

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Analytics Dashboard</h1>
        <p className="text-slate-500 mt-1">Ringkasan statistik penggunaan aplikasi DocAuto HR.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center space-x-4">
          <div className="bg-blue-100 p-3 rounded-lg text-blue-600">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Total Dokumen</p>
            <h4 className="text-2xl font-bold text-slate-900">{totalDocs}</h4>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center space-x-4">
          <div className="bg-emerald-100 p-3 rounded-lg text-emerald-600">
            <FileSignature className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Total PKWT</p>
            <h4 className="text-2xl font-bold text-slate-900">{pkwtCount}</h4>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center space-x-4">
          <div className="bg-amber-100 p-3 rounded-lg text-amber-600">
            <FilePlus className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Total SK</p>
            <h4 className="text-2xl font-bold text-slate-900">{skCount}</h4>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center space-x-4">
          <div className="bg-purple-100 p-3 rounded-lg text-purple-600">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Pengguna Aktif</p>
            <h4 className="text-2xl font-bold text-slate-900">{uniqueUsers}</h4>
          </div>
        </div>
      </div>

      {/* Charts */}
      {logs && logs.length > 0 ? (
        <DashboardCharts logs={logs} />
      ) : (
        <div className="mt-8 p-12 bg-white rounded-xl shadow-sm border border-slate-100 text-center text-slate-500">
          Belum ada data dokumen untuk ditampilkan pada grafik.
        </div>
      )}
    </div>
  );
}
