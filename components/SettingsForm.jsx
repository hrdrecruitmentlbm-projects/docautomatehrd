"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { documentConfigs } from "@/lib/document-configs";
import { toast } from "sonner";
import { Save, Loader2 } from "lucide-react";

export function SettingsForm({ initialSettings = {} }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register, handleSubmit } = useForm({ defaultValues: initialSettings });

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error("Gagal menyimpan pengaturan");
      
      toast.success("Pengaturan berhasil disimpan!");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4">
          <CardTitle className="text-lg text-slate-800">Pengaturan Umum</CardTitle>
          <CardDescription>Atur penandatangan default untuk semua dokumen.</CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="signatory_name">Nama Penandatangan (Default)</Label>
              <Input id="signatory_name" {...register('signatory_name')} placeholder="Cth: Budi Santoso" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="signatory_title">Jabatan Penandatangan (Default)</Label>
              <Input id="signatory_title" {...register('signatory_title')} placeholder="Cth: HR Manager" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4">
          <CardTitle className="text-lg text-slate-800">Template & Folder Google Drive</CardTitle>
          <CardDescription>
            Ambil ID dari URL Google Drive: <code className="text-xs bg-slate-200 px-1 py-0.5 rounded text-blue-600">docs.google.com/document/d/INI_ID_NYA/edit</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-8">
          {documentConfigs.map(config => (
            <div key={config.id} className="pt-4 first:pt-0 border-t first:border-0 border-slate-100">
              <h4 className="font-semibold text-slate-700 mb-4 flex items-center">
                <div className={`w-2 h-2 rounded-full mr-2 bg-blue-500`}></div>
                Konfigurasi {config.label}
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor={`${config.id}_template_id`}>Template ID (Google Doc)</Label>
                  <Input 
                    id={`${config.id}_template_id`} 
                    {...register(`${config.id}_template_id`)} 
                    placeholder="Masukkan ID Template" 
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${config.id}_folder_id`}>Target Folder ID (Google Drive)</Label>
                  <Input 
                    id={`${config.id}_folder_id`} 
                    {...register(`${config.id}_folder_id`)} 
                    placeholder="Masukkan ID Folder" 
                    className="font-mono text-sm"
                  />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting} className="min-w-[150px] bg-slate-900 hover:bg-slate-800">
          {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Simpan Pengaturan
        </Button>
      </div>
    </form>
  );
}
