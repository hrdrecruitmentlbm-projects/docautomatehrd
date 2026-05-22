import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { DashboardCharts } from "@/components/DashboardCharts";
import Link from "next/link";
import { FileText, FileSignature, FilePlus, Users, Plus, Clock } from "lucide-react";

export default async function NewDashboardPage() {
  const session = await auth();

  const { data: logs } = await supabaseAdmin
    .from('document_logs')
    .select('*')
    .order('created_at', { ascending: false });

  const allLogs = logs || [];
  const totalDocs = allLogs.length;
  const pkwtCount = allLogs.filter(l => l.document_type?.toLowerCase() === 'pkwt').length;
  const skCount = allLogs.filter(l => l.document_type?.toLowerCase() === 'sk').length;
  const uniqueUsers = new Set(allLogs.map(l => l.user_email)).size;

  const recentDocs = allLogs.slice(0, 5);
  const tableRows = allLogs.slice(0, 4);

  const typeData = ['pkwt', 'sk', 'memo', 'sp'].map(type => ({
    name: type.toUpperCase(),
    value: allLogs.filter(l => l.document_type?.toLowerCase() === type).length
  })).filter(d => d.value > 0);

  const kpis = [
    { label: "Total PKWT", value: pkwtCount, icon: FileSignature, color: "bg-purple-100 text-purple-600" },
    { label: "Total SK", value: skCount, icon: FilePlus, color: "bg-blue-100 text-blue-600" },
    { label: "Total Dokumen", value: totalDocs, icon: FileText, color: "bg-green-100 text-green-600" },
    { label: "Pengguna Aktif", value: uniqueUsers, icon: Users, color: "bg-orange-100 text-orange-600" },
  ];

  const docTypeColors = {
    pkwt: 'bg-blue-100 text-blue-700',
    sk: 'bg-emerald-100 text-emerald-700',
    memo: 'bg-amber-100 text-amber-700',
    sp: 'bg-red-100 text-red-700',
  };

  return (
    <div className="max-w-full">
      {/* Page Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Dashboard</h1>
      </div>

      {/* KPI Bar */}
      <div className="flex items-center gap-4 mb-8 bg-white rounded-2xl px-6 py-4 shadow-sm border border-slate-100">
        {kpis.map((kpi, i) => (
          <div key={i} className={`flex items-center gap-3 ${i < kpis.length - 1 ? 'pr-6 border-r border-slate-100' : ''} flex-1`}>
            <div className={`p-2.5 rounded-xl ${kpi.color}`}>
              <kpi.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{kpi.label}</p>
              <p className="text-xl font-extrabold text-slate-800">{kpi.value}</p>
            </div>
          </div>
        ))}
        <Link
          href="/input-dokumen"
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors shadow-sm whitespace-nowrap ml-4"
        >
          <Plus className="w-4 h-4" />
          New Document
        </Link>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6 mb-6">
        {/* Pending/Recent Documents Table */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Recent</p>
              <h3 className="text-[15px] font-extrabold text-slate-800">Dokumen Terbaru</h3>
            </div>
            <Link href="/history" className="text-xs font-bold text-blue-600 hover:underline">
              View All
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[11px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-50">
                  <th className="text-left px-6 py-3 font-semibold">File Name</th>
                  <th className="text-left px-4 py-3 font-semibold">Type</th>
                  <th className="text-left px-4 py-3 font-semibold">Date</th>
                  <th className="text-left px-4 py-3 font-semibold">Creator</th>
                  <th className="text-left px-4 py-3 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-slate-400 py-10 text-sm">Belum ada dokumen</td>
                  </tr>
                ) : (
                  tableRows.map((log) => (
                    <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-3 text-sm font-semibold text-slate-700">{log.employee_name || 'Dokumen'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg uppercase ${docTypeColors[log.document_type?.toLowerCase()] || 'bg-slate-100 text-slate-600'}`}>
                          {log.document_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 font-medium">
                        {new Date(log.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-400 font-medium truncate max-w-[160px]">{log.user_email}</td>
                      <td className="px-4 py-3">
                        <a href={log.google_doc_url} target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-600 hover:underline">
                          Open
                        </a>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Documents Summary Donut */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Overview</p>
            <h3 className="text-[15px] font-extrabold text-slate-800">Documents Summary</h3>
          </div>
          <DashboardCharts logs={allLogs} chartType="pie" />
          <div className="mt-4 space-y-2">
            {typeData.map((d, i) => {
              const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
              return (
                <div key={i} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: colors[i % colors.length] }}></div>
                    <span className="font-semibold text-slate-600 uppercase text-xs">{d.name}</span>
                  </div>
                  <span className="font-bold text-slate-800 text-xs">{d.value}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_1fr] gap-6">
        {/* Recent Documents List */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Recent</p>
            <h3 className="text-[15px] font-extrabold text-slate-800">Dokumen Saya</h3>
          </div>
          <div className="space-y-3">
            {recentDocs.filter(l => l.user_email === session?.user?.email).slice(0, 4).length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">Anda belum membuat dokumen</p>
            ) : (
              recentDocs.filter(l => l.user_email === session?.user?.email).slice(0, 4).map((log) => (
                <a key={log.id} href={log.google_doc_url} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors group">
                  <div className={`p-2 rounded-lg ${docTypeColors[log.document_type?.toLowerCase()] || 'bg-slate-100 text-slate-600'}`}>
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-slate-700 truncate group-hover:text-blue-600 transition-colors">{log.employee_name || 'Dokumen'}</p>
                    <p className="text-[11px] text-slate-400 font-medium">
                      {new Date(log.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                    </p>
                  </div>
                </a>
              ))
            )}
          </div>
        </div>

        {/* Recent Activities */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Timeline</p>
              <h3 className="text-[15px] font-extrabold text-slate-800">Recent Activities</h3>
            </div>
            <Link href="/history" className="text-xs font-bold text-blue-600 hover:underline">View All</Link>
          </div>
          <div className="space-y-4">
            {allLogs.slice(0, 4).map((log, i) => (
              <div key={log.id} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  {i < 3 && <div className="w-px h-6 bg-slate-100 mt-1"></div>}
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[13px] font-bold text-slate-700">Dokumen Dibuat</p>
                    <p className="text-[10px] text-slate-400 font-medium flex items-center gap-1 whitespace-nowrap">
                      <Clock className="w-2.5 h-2.5" />
                      {new Date(log.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}
                    </p>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    <span className="font-semibold text-slate-500">{log.user_email?.split('@')[0]}</span> membuat <span className="font-semibold text-blue-600 uppercase">{log.document_type}</span> untuk <span className="font-semibold">{log.employee_name || '—'}</span>
                  </p>
                </div>
              </div>
            ))}
            {allLogs.length === 0 && (
              <p className="text-sm text-slate-400 py-4 text-center">Belum ada aktivitas</p>
            )}
          </div>
        </div>

        {/* Analysis Bar Chart */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">Chart</p>
              <h3 className="text-[15px] font-extrabold text-slate-800">Analysis</h3>
            </div>
          </div>
          <DashboardCharts logs={allLogs} chartType="bar" />
        </div>
      </div>
    </div>
  );
}
