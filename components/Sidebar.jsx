"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, FilePlus, History, Settings, LogOut, Briefcase } from "lucide-react";
import { signOut } from "next-auth/react";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/input-dokumen", icon: FilePlus, label: "Documents" },
  { href: "/history", icon: History, label: "Activity" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar({ user }) {
  const pathname = usePathname();

  return (
    <aside className="w-[280px] bg-white text-slate-500 min-h-full flex flex-col border-r border-slate-100/50 relative py-8">
      {/* Profile Section */}
      <div className="flex flex-col items-center justify-center mb-10 px-6">
        <div className="relative mb-4">
          {user?.image ? (
            <img src={user.image} alt="User" className="w-[88px] h-[88px] rounded-[2rem] shadow-sm border-[3px] border-white ring-[3px] ring-blue-50 object-cover" />
          ) : (
            <div className="w-[88px] h-[88px] rounded-[2rem] bg-blue-50 flex items-center justify-center text-blue-600 text-3xl font-bold shadow-sm border-[3px] border-white ring-[3px] ring-blue-50">
              {user?.name?.charAt(0) || "U"}
            </div>
          )}
        </div>
        <h3 className="font-bold text-slate-800 text-lg tracking-tight">{user?.name || "User Name"}</h3>
        <p className="text-[11px] font-semibold text-slate-400 mt-0.5 uppercase tracking-wider flex items-center">
          HR Department
        </p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-1.5">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center space-x-4 px-6 py-3.5 rounded-2xl transition-all font-bold text-[13px] relative overflow-hidden",
                isActive 
                  ? "text-blue-600 bg-blue-50/50 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-1.5 before:bg-blue-600 before:rounded-r-full" 
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              )}
            >
              <item.icon className={cn("h-[18px] w-[18px]", isActive ? "text-blue-600" : "text-slate-400")} />
              <span>{item.label}</span>
              {item.label === 'Activity' && (
                <span className="absolute right-4 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                  12
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      
      {/* Logout */}
      <div className="px-6 mt-auto">
        <button
          onClick={() => signOut()}
          className="flex items-center space-x-4 text-slate-400 hover:text-red-500 transition-colors font-bold text-[13px] px-6 py-3 w-full"
        >
          <LogOut className="h-[18px] w-[18px]" />
          <span>Log Out</span>
        </button>
      </div>
    </aside>
  );
}
