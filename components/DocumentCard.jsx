"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const colorMap = {
  blue: "bg-blue-50 text-blue-700 border-blue-200",
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  yellow: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-rose-50 text-rose-700 border-rose-200",
};

const iconColorMap = {
  blue: "text-blue-600 bg-blue-100",
  green: "text-emerald-600 bg-emerald-100",
  yellow: "text-amber-600 bg-amber-100",
  red: "text-rose-600 bg-rose-100",
};

export function DocumentCard({ config }) {
  const { id, label, description, color } = config;
  
  return (
    <Card className={cn("border-2 transition-all hover:shadow-md", colorMap[color] || colorMap.blue)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className={cn("p-2 rounded-lg", iconColorMap[color] || iconColorMap.blue)}>
            <FileText className="h-6 w-6" />
          </div>
        </div>
        <CardTitle className="text-xl mt-4">{label}</CardTitle>
        <CardDescription className="text-slate-600 font-medium">{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Link href={`/generate/${id}`} className="block w-full">
          <Button className="w-full bg-white hover:bg-slate-50 text-slate-900 border shadow-sm group">
            Buat Dokumen
            <ChevronRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}
