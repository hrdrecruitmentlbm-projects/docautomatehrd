import { Sidebar } from "@/components/Sidebar";

export default function AppLayout({ children }) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 flex flex-col">
        <div className="flex-1 p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
