import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileText, ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="px-8 py-6 bg-white border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="bg-blue-600 p-1.5 rounded-lg">
            <FileText className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold text-slate-900 tracking-tight">DocAuto HR</span>
        </div>
        <Link href="/login">
          <Button variant="outline" className="font-medium text-slate-700 bg-white shadow-sm hover:bg-slate-50 border-slate-200">
            Masuk
          </Button>
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center text-center px-4">
        <div className="max-w-3xl space-y-8">
          <div className="inline-block bg-blue-100 text-blue-800 text-sm font-semibold px-4 py-1.5 rounded-full mb-4">
            Otomatisasi Dokumen HR 100% Google Workspace
          </div>
          <h1 className="text-5xl md:text-6xl font-extrabold text-slate-900 tracking-tight leading-tight">
            Buat Dokumen HR <br className="hidden md:block" /> 
            <span className="text-blue-600">Dalam Hitungan Detik</span>
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Hasilkan PKWT, Surat Keputusan, Memo, dan Surat Peringatan secara instan dari template Google Docs Anda. Semua tersimpan rapi di Google Drive.
          </p>
          <div className="pt-4 flex items-center justify-center space-x-4">
            <Link href="/login">
              <Button size="lg" className="h-14 px-8 text-lg font-medium bg-blue-600 hover:bg-blue-700 text-white shadow-md">
                Mulai Sekarang
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </main>
      
      <footer className="py-8 text-center text-slate-500 text-sm border-t border-slate-200 bg-white">
        &copy; {new Date().getFullYear()} DocAuto HR. Hak cipta dilindungi undang-undang.
      </footer>
    </div>
  );
}
