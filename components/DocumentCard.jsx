"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const colorMap = {
  // TODO(step-3): DocumentCard is replaced by the folder-strip Files hub;
  // this interim remap only kills the blue identity for the token commit.
  blue: "bg-emerald-50 text-emerald-700 border-emerald-200",
  green: "bg-amber-50 text-amber-700 border-amber-200",
  yellow: "bg-slate-50 text-slate-700 border-slate-200",
  red: "bg-red-50 text-red-700 border-red-200",
};

const iconColorMap = {
  blue: "text-emerald-600 bg-emerald-100",
  green: "text-amber-600 bg-amber-100",
  yellow: "text-slate-600 bg-slate-100",
  red: "text-red-600 bg-red-100",
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
