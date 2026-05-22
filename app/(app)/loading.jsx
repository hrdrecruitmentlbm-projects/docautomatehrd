import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
      <h3 className="text-lg font-medium text-slate-900">Memuat Data...</h3>
      <p className="text-slate-500 text-sm">Mohon tunggu sebentar.</p>
    </div>
  );
}
