import { Sidebar } from "@/components/Sidebar";
import { auth } from "@/auth";

export default async function AppLayout({ children }) {
  const session = await auth();
  
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#e8eef6] p-4 sm:p-8 relative overflow-hidden">
      {/* Background blobs simulating the mockup */}
      <div className="absolute top-[-15%] left-[-10%] w-[50%] h-[60%] bg-[#2563eb] rounded-[40%_60%_70%_30%/40%_50%_60%_50%] blur-[120px] opacity-30 pointer-events-none"></div>
      <div className="absolute bottom-[-15%] right-[-10%] w-[50%] h-[60%] bg-[#3b82f6] rounded-[60%_40%_30%_70%/50%_60%_40%_50%] blur-[120px] opacity-30 pointer-events-none"></div>
      
      {/* The main app floating window */}
      <div className="w-full max-w-[1440px] h-[92vh] min-h-[800px] bg-[#f8fafc] rounded-[2rem] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] flex overflow-hidden border border-white/60 relative z-10">
        <Sidebar user={session?.user} />
        <main className="flex-1 flex flex-col overflow-y-auto bg-[#f8fafc]">
          <div className="flex-1 p-8 sm:p-12">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
