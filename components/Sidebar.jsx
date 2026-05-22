"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, FilePlus, History, Settings, FileText } from "lucide-react";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/input-dokumen", icon: FilePlus, label: "Input Dokumen" },
  { href: "/history", icon: History, label: "Riwayat Dokumen" },
  { href: "/settings", icon: Settings, label: "Pengaturan" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 bg-slate-900 text-slate-300 min-h-screen flex flex-col">
      <div className="p-6 flex items-center space-x-3 mb-6">
        <div className="bg-blue-600 p-2 rounded-lg">
          <FileText className="h-6 w-6 text-white" />
        </div>
        <span className="text-xl font-bold text-white tracking-tight">DocAuto HR</span>
      </div>

      <nav className="flex-1 px-4 space-y-2">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors",
                isActive 
                  ? "bg-slate-800 text-white font-medium shadow-sm" 
                  : "hover:bg-slate-800 hover:text-white"
              )}
            >
              <item.icon className={cn("h-5 w-5", isActive ? "text-blue-400" : "text-slate-400")} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      
      <div className="p-4 text-xs text-slate-500 text-center mt-auto border-t border-slate-800">
        &copy; {new Date().getFullYear()} DocAuto HR
      </div>
    </aside>
  );
}
