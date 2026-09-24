import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ExternalLink, FileText } from "lucide-react";

export default async function HistoryPage() {
  const session = await auth();
  
  const { data: logs, error } = await supabaseAdmin
    .from('document_logs')
    .select('*')
    .eq('user_email', session?.user?.email)
    .order('created_at', { ascending: false })
    .limit(50);

  // error != empty: a failed query must route to error.jsx, never render
  // as "Belum ada riwayat".
  if (error) {
    throw new Error(`Gagal memuat riwayat: ${error.message}`);
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* headerMode: "shell" — TopBar owns the single <h1> + subtitle.
          Scope note: this table is PERSONAL (eq user_email); dashboard and
          search are global. The shell subtitle carries that framing. */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {(!logs || logs.length === 0) ? (
          <div className="p-12 flex flex-col items-center justify-center text-center">
            <div className="bg-slate-50 p-4 rounded-full mb-4">
              <FileText className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-1">Belum ada riwayat</h3>
            <p className="text-slate-500">Anda belum membuat dokumen apapun.</p>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="w-[150px]">Tanggal Dibuat</TableHead>
                <TableHead>Jenis Dokumen</TableHead>
                <TableHead>Dibuat Oleh</TableHead>
                <TableHead>Nama / Kepada</TableHead>
                <TableHead>Nomor Dokumen</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="font-medium text-slate-600">
                    {new Date(log.created_at).toLocaleDateString('id-ID')}
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 uppercase">
                      {log.document_type}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-slate-500">{log.user_email}</TableCell>
                  <TableCell>{log.employee_name || "-"}</TableCell>
                  <TableCell className="text-sm font-mono text-slate-500">{log.document_number}</TableCell>
                  <TableCell className="text-right">
                    <a href={log.google_doc_url} target="_blank" rel="noreferrer">
                      <Button variant="outline" size="sm" className="h-8">
                        <ExternalLink className="w-3.5 h-3.5 mr-2" />
                        Buka
                      </Button>
                    </a>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
