"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { COMPANY_CODES } from "@/lib/company-codes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FileDown, Loader2 } from "lucide-react";

export function DynamicForm({ config }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  
  const { register, handleSubmit, setValue, formState: { errors } } = useForm();

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    setResult(null);
    try {
      // companyCode is handled via standard fields now
      const { companyCode, ...formData } = data;
      
      const response = await fetch('/api/generate-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentType: config.id,
          companyCode: companyCode,
          formData: formData
        }),
      });
      
      const resultData = await response.json();
      
      if (!response.ok) {
        throw new Error(resultData.error || "Terjadi kesalahan");
      }
      
      setResult(resultData);
      toast.success("Dokumen berhasil dibuat!");
      
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      {result && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 flex items-center justify-between">
          <div>
            <h3 className="text-emerald-800 font-semibold text-lg">Dokumen Berhasil Dibuat!</h3>
            <p className="text-emerald-600 text-sm mt-1">Dokumen telah tersimpan di Google Drive.</p>
          </div>
          <a href={result.docUrl} target="_blank" rel="noreferrer">
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm">
              <FileDown className="w-4 h-4 mr-2" />
              Buka Dokumen
            </Button>
          </a>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 bg-white p-8 rounded-xl shadow-sm border border-slate-100">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="companyCode">Perusahaan (Kode) <span className="text-red-500">*</span></Label>
            <Select onValueChange={(val) => setValue('companyCode', val, { shouldValidate: true })}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih perusahaan" />
              </SelectTrigger>
              <SelectContent>
                {COMPANY_CODES.map(c => (
                  <SelectItem key={c.code} value={c.code}>{c.name} ({c.code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {config.fields.map((field) => (
            <div key={field.key} className={`space-y-2 ${field.type === 'textarea' ? 'md:col-span-2' : ''}`}>
              <Label htmlFor={field.key}>
                {field.label} {field.required && <span className="text-red-500">*</span>}
              </Label>
              
              {field.type === 'textarea' ? (
                <Textarea 
                  id={field.key} 
                  placeholder={`Masukkan ${field.label.toLowerCase()}`}
                  {...register(field.key, { required: field.required })}
                  className="min-h-[100px]"
                />
              ) : field.type === 'select' ? (
                <Select onValueChange={(val) => setValue(field.key, val, { shouldValidate: true })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih..." />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options?.map(opt => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input 
                  id={field.key}
                  type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
                  placeholder={`Masukkan ${field.label.toLowerCase()}`}
                  {...register(field.key, { required: field.required })}
                />
              )}
            </div>
          ))}
        </div>

        <div className="pt-4 flex justify-end">
          <Button type="submit" disabled={isSubmitting} className="w-full md:w-auto min-w-[200px] bg-blue-600 hover:bg-blue-700">
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Membuat Dokumen...
              </>
            ) : (
              "Buat Dokumen Sekarang"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
