"use client";
import { readJson } from "@/lib/http";

import * as React from "react";
import { toast } from "sonner";
import {
  ScanSearch,
  ShieldAlert,
  CircleCheck,
  XCircle,
  Loader2,
  TriangleAlert,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Pemeriksaan dokumen: template SEBELUM membuat, arsip SESUDAH membuat.
 *
 * Dua mode ini menjawab dua pertanyaan berbeda dan keduanya berakar pada
 * masalah yang sama — penanda {{…}} yang gagal terisi. Di template itu
 * bakal terkirim apa adanya ke setiap kontrak berikutnya; di arsip itu
 * sudah keluar dari cetak dan tidak ada yang tahu.
 *
 * Pemeriksaan arsip dijalankan manual, bukan otomatis: setiap dokumen
 * berarti satu panggilan Google Docs API, dan seluruh riwayat bisa
 * ratusan. Potongan 10 per permintaan, dengan progres — pola yang sama
 * dengan SheetsSync supaya mekanismenya konsisten.
 */

export function DocumentHealth() {
  const [audit, setAudit] = React.useState(null);
  const [auditing, setAuditing] = React.useState(false);
  const [auditError, setAuditError] = React.useState(null);

  const [run, setRun] = React.useState(null);
  const [scanning, setScanning] = React.useState(false);
  const [flagged, setFlagged] = React.useState([]);
  const [failed, setFailed] = React.useState([]);

  const runAudit = async () => {
    setAuditing(true);
    setAuditError(null);
    try {
      const res = await fetch("/api/template-audit");
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || "Gagal memeriksa template");
      setAudit(data);
      if (data.summary.bermasalah === 0) {
        toast.success("Semua template penandanya bisa diisi aplikasi");
      } else {
        toast.warning(
          `${data.summary.bermasalah} template punya penanda yang tidak dikenal`
        );
      }
    } catch (e) {
      setAuditError(e.message);
      toast.error(e.message);
    } finally {
      setAuditing(false);
    }
  };

  const runBackfill = async () => {
    setScanning(true);
    setFlagged([]);
    setFailed([]);
    setRun({ offset: 0, scanned: 0, done: false });
    let offset = 0;
    let scanned = 0;
    let guard = 0;

    try {
      for (;;) {
        if (guard++ > 600) break; // hard stop, jangan sampai berjalan selamanya
        const res = await fetch("/api/documents/backfill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offset }),
        });
        const data = await readJson(res);
        if (!res.ok) throw new Error(data.error || "Pemeriksaan gagal");

        scanned += data.scanned || 0;
        if (data.flagged?.length) setFlagged((p) => [...p, ...data.flagged]);
        if (data.failed?.length) setFailed((p) => [...p, ...data.failed]);
        setRun({ offset: data.nextOffset, scanned, done: data.done });

        if (data.done) break;
        offset = data.nextOffset;
      }
      toast.success("Pemeriksaan arsip selesai");
    } catch (e) {
      toast.error(e.message);
      setRun((r) => (r ? { ...r, error: e.message } : { offset, scanned, done: true, error: e.message }));
    } finally {
      setScanning(false);
    }
  };

  const totalRun = run ? Math.max(run.scanned + flagged.length, 1) : 0;

  return (
    <div className="space-y-4">
      {/* ---------- Mode A: pemeriksaan template ---------- */}
      <section aria-labelledby="audit-template-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 id="audit-template-heading" className="text-[15px] font-semibold text-text-1">
              Pemeriksaan Template
            </h3>
            <p className="mt-0.5 text-sm text-text-2">
              Mencari penanda yang tidak bisa diisi aplikasi. Penanda seperti
              ini keluar apa adanya di kontrak.
            </p>
          </div>
          <Button
            variant="outline"
            className="h-10"
            onClick={runAudit}
            disabled={auditing}
            aria-busy={auditing}
          >
            {auditing ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
            ) : (
              <ScanSearch className="mr-2 size-4" aria-hidden="true" />
            )}
            Periksa Template
          </Button>
        </div>

        {auditError && (
          <div role="alert" className="rounded-md border border-border bg-surface-2 p-3 text-sm">
            <p className="font-semibold text-text-1">Pemeriksaan gagal</p>
            <p className="mt-0.5 text-text-2">{auditError}</p>
          </div>
        )}

        {audit && (
          <div className="overflow-hidden rounded-md border border-border">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-border bg-surface-2 px-4 py-2.5 text-sm">
              <span className="text-text-2">
                {audit.summary.total} template diperiksa
              </span>
              {audit.summary.bermasalah > 0 ? (
                <span className="font-medium text-amber-800">
                  {audit.summary.bermasalah} perlu diperbaiki
                </span>
              ) : (
                <span className="flex items-center gap-1.5 font-medium text-emerald-700">
                  <CircleCheck className="size-4" aria-hidden="true" />
                  Semua bersih
                </span>
              )}
            </div>

            <ul className="divide-y divide-border">
              {audit.results.map((r) => (
                <li key={r.key} className="px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-medium text-text-1">
                      {r.problems > 0 ? (
                        <ShieldAlert className="size-4 shrink-0 text-amber-600" aria-hidden="true" />
                      ) : (
                        <CircleCheck className="size-4 shrink-0 text-emerald-600" aria-hidden="true" />
                      )}
                      {r.label}
                    </span>
                    <a
                      href={`https://docs.google.com/document/d/${r.templateId}/edit`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                    >
                      Buka template
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  </div>

                  {!r.ok ? (
                    <p className="mt-1.5 flex items-start gap-1.5 text-xs text-red-700">
                      <XCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      {r.error}
                    </p>
                  ) : (
                    <>
                      {r.tidakDikenal.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs font-medium text-amber-800">
                            {r.tidakDikenal.length} penanda tidak dikenal — akan
                            terkirim apa adanya:
                          </p>
                          <ul className="mt-1 flex flex-wrap gap-1.5">
                            {r.tidakDikenal.map((m) => (
                              <li
                                key={m.key}
                                className="rounded border border-amber-300 bg-amber-50 px-1.5 py-0.5 font-mono text-xs text-amber-900"
                              >
                                {`{{${m.key}}}`}
                                {m.count > 1 && (
                                  <span className="ml-1 font-sans text-amber-700">
                                    ×{m.count}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {!r.adaPenandaKop && (
                        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-800">
                          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                          Tidak ada penanda KOP — semua dokumen dari template ini
                          akan tanpa kop.
                        </p>
                      )}
                      {r.tidakDikenal.length === 0 && r.adaPenandaKop && (
                        <p className="mt-1.5 text-xs text-emerald-700">
                          {r.total} penanda, semuanya bisa diisi.
                        </p>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ---------- Mode B: pemeriksaan arsip ---------- */}
      <section aria-labelledby="audit-arsip-heading" className="space-y-3 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 id="audit-arsip-heading" className="text-[15px] font-semibold text-text-1">
              Pemeriksaan Arsip
            </h3>
            <p className="mt-0.5 text-sm text-text-2">
              Menyalakan penanda yang masih tertinggal di dokumen yang sudah
              dibuat. Jalankan sekali untuk tahu kontrak mana yang perlu
              diperbaiki.
            </p>
          </div>
          <Button
            variant="outline"
            className="h-10"
            onClick={runBackfill}
            disabled={scanning}
            aria-busy={scanning}
          >
            {scanning ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
            ) : (
              <ScanSearch className="mr-2 size-4" aria-hidden="true" />
            )}
            Periksa Semua Arsip
          </Button>
        </div>

        {run && (
          <div className="rounded-md border border-border bg-surface-1 p-4">
            <div
              role="progressbar"
              aria-label="Progres pemeriksaan arsip"
              aria-valuemin={0}
              aria-valuemax={run.done ? totalRun : 0}
              aria-valuenow={totalRun}
              className="h-2 w-full overflow-hidden rounded-full bg-surface-3"
            >
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
                style={{
                  width: run.done ? "100%" : `${Math.min(100, (run.offset / 500) * 100)}%`,
                }}
              />
            </div>
            <p className="mt-2 text-sm text-text-2" role="status">
              {run.error ? (
                <span className="text-red-700">{run.error}</span>
              ) : run.done ? (
                <>
                  Selesai. {run.scanned} dokumen diperiksa,{" "}
                  <span className={flagged.length ? "font-medium text-amber-800" : "font-medium text-emerald-700"}>
                    {flagged.length} punya penanda belum terisi
                  </span>
                  .
                </>
              ) : (
                <>
                  Memeriksa... {run.offset} dokumen dilewati
                </>
              )}
            </p>

            {flagged.length > 0 && (
              <div className="mt-3 overflow-hidden rounded-md border border-amber-300">
                <p className="border-b border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                  {flagged.length} dokumen perlu diperbaiki
                </p>
                <ul className="max-h-64 divide-y divide-border overflow-y-auto">
                  {flagged.map((f) => (
                    <li key={f.id} className="px-3 py-2">
                      <a
                        href={`/input-dokumen/${f.id}`}
                        className="block truncate font-mono text-xs text-primary hover:underline"
                      >
                        {f.document_number || f.id}
                      </a>
                      <span className="block truncate text-xs text-text-2">
                        {f.employee_name || "-"} ·{" "}
                        {new Date(f.created_at).toLocaleDateString("id-ID", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {f.unfilled.map((m) => (
                          <span
                            key={m}
                            className="rounded border border-amber-300 bg-amber-50 px-1 py-0.5 font-mono text-[11px] text-amber-900"
                          >
                            {`{{${m}}}`}
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {failed.length > 0 && (
              <p className="mt-3 text-xs text-amber-700">
                {failed.length} dokumen tidak bisa diperiksa (mungkin sudah
                dihapus dari Drive atau tidak punya akses).
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
