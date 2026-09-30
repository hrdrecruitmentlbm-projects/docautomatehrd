import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FolderOpen, Hash } from "lucide-react";
import { supabaseAdmin } from "@/lib/supabase";
import { EmployeeSnapshot } from "@/components/documents/EmployeeSnapshot";
import { DocumentActions } from "@/components/documents/DocumentActions";
import { StatusBadge, ContractStateBadge } from "@/components/documents/DocumentStatus";
import { UnfilledMarksWarning } from "@/components/documents/UnfilledMarksWarning";
import {
  formatIsoId,
  toIsoDate,
  stateKontrak,
  monthsUntil,
  DOKUMEN_STATUS,
} from "@/lib/contract-lifecycle";
import { docTypeMeta, isContractType, DOC_TYPE_ORDER } from "@/lib/doc-types";

/**
 * Rincian satu dokumen.
 *
 * CUKUPAN GLOBAL (sengaja): halaman ini menampilkan data karyawan dan
 * gaji dari snapshot arsip, jadi pengguna mana pun yang sudah masuk bisa
 * membacanya. Ini konsisten dengan "Documents" yang sudah berlabel
 * "Semua pengguna" dan dengan pencarian global — tetapi berarti siapa pun
 * yang bisa masuk bisa membaca gaji tanpa membuka Drive. Kalau nanti
 * dibatasi per pengguna, filter .eq("user_email", ...) tinggal ditambah di
 * query di bawah.
 *
 * DATA ARSIP, BUKAN DATA LIVE: halaman ini membaca form_data (nilai saat
 * dokumen dibuat), bukan tabel employees. Kalau master HR diperbaiki
 * esok hari, kontrak ini tetap menampilkan angka yang benar-benar tercetak
 * di kertas — dan justru itulah yang dibutuhkan untuk memverifikasi.
 */

const TYPE_META = Object.fromEntries(
  DOC_TYPE_ORDER.map((t) => [t, docTypeMeta(t)])
);

export default async function DocumentDetailPage({ params }) {
  const { id } = await params;
  if (!id) notFound();

  const { data: log, error } = await supabaseAdmin
    .from("document_logs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Gagal memuat dokumen: ${error.message}`);
  }
  if (!log) notFound();

  // Dokumen lain untuk karyawan yang sama (untuk melihat riwayat kontrak).
  const employeeKey = log.employee_nama_key || log.form_data?.employee_nama_key;
  let siblings = [];
  if (employeeKey) {
    const { data } = await supabaseAdmin
      .from("document_logs")
      .select("id,document_number,document_type,created_at,tanggal_berakhir,google_doc_url,employee_name")

      .eq("employee_nama_key", employeeKey)
      .neq("id", log.id)
      .order("created_at", { ascending: false })
      .limit(10);
    siblings = data || [];
  }

  const type = (log.document_type || "").toLowerCase();
  const meta = TYPE_META[type] || docTypeMeta(log.document_type);
  const contract = isContractType(type);

  const snapshot = log.form_data || {};
  const employee = snapshot.employee || null;
  const payroll = snapshot.payroll || null;
  const company = {
    code: log.company_code || null,
    hasKop: log.company_code && !["SAHAM", "TALOG", "TAST"].includes(String(log.company_code).toUpperCase()),
  };

  const startIso = toIsoDate(log.tanggal_mulai || snapshot.tanggal_mulai);
  const endIso = toIsoDate(log.tanggal_berakhir || snapshot.tanggal_berakhir);
  const remaining = monthsUntil(endIso);
  const state = log.tanggal_berakhir || snapshot.tanggal_berakhir
    ? stateKontrak(endIso)
    : null;

  // Paklaring tidak punya tanggal_mulai di document_logs — masa kerjanya
  // datang dari employees.tanggal_masuk, jadi diambil dari snapshot arsip.
  // Nilai LIVE dari master sengaja tidak dipakai: halaman ini harus
  // menampilkan angka yang benar-benar tercetak di kertas, sama seperti
  // kolom lain di halaman ini.
  const masukIso = employee?.tanggal_masuk || snapshot.tanggal_masuk || null;
  const keluarIso = toIsoDate(log.tanggal_keluar || snapshot.tanggal_keluar);

  const unfilled = log.unfilled_marks || [];

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {/* headerMode: "shell" -> TopBar punya satu-satunya <h1>.
          Body ini tidak menambah h1 kedua. */}
      <Link
        href="/input-dokumen"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-text-2 transition-colors hover:text-text-1"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Kembali ke Dokumen
      </Link>

      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-mono text-lg font-semibold tracking-tight text-text-1 sm:text-xl">
            {log.document_number || "Tanpa nomor"}
          </h2>
          <span className={`inline-flex h-5 items-center rounded-full px-2 text-xs font-medium ${meta.tile}`}>
            {meta.label}
          </span>
          <StatusBadge status={log.status_dokumen} />
          {state && <ContractStateBadge tanggalBerakhir={endIso} />}
        </div>

        <p className="text-sm text-text-2">
          Dibuat{" "}
          {new Date(log.created_at).toLocaleString("id-ID", {
            day: "2-digit",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          oleh <span className="text-text-1">{log.user_email}</span>
        </p>

        {log.folder_path && (
          <p className="flex items-center gap-1.5 text-xs text-text-2">
            <FolderOpen className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="font-mono">HRIS PKWT/{log.folder_path}</span>
          </p>
        )}
      </header>

      {unfilled.length > 0 && (
        <UnfilledMarksWarning
          marks={unfilled}
          verifiedAt={log.verified_at}
          docUrl={log.google_doc_url}
        />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4">
          {/* Data yang dipakai: dari form_data, bukan dari employees. */}
          <section
            aria-labelledby="data-dipakai-heading"
            className="rounded-lg border border-border bg-surface-1 p-5"
          >
            <h3 id="data-dipakai-heading" className="text-[15px] font-semibold text-text-1">
              Data yang Digunakan
            </h3>
            <p className="mt-1 max-w-prose text-sm text-text-2">
              Salinan data saat dokumen dibuat. Perubahan di master tidak
              mengubah tampilan di halaman ini.
            </p>

            <div className="mt-4">
              {employee ? (
                <EmployeeSnapshot
                  employee={employee}
                  payroll={payroll}
                  company={company}
                  archived
                  showPayroll={contract}
                />
              ) : (
                <p className="text-sm text-text-2">
                  Dokumen ini tidak menyimpan snapshot data karyawan (dibuat
                  sebelum fitur ini ada, atau lewat template SK/Memo/SP).
                </p>
              )}
            </div>
          </section>

          {contract && (
            <section
              aria-labelledby="masa-kontrak-heading"
              className="rounded-lg border border-border bg-surface-1 p-5"
            >
              <h3 id="masa-kontrak-heading" className="text-[15px] font-semibold text-text-1">
                Masa Kontrak
              </h3>
              <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-text-2">Mulai</dt>
                  <dd className="text-sm font-medium text-text-1">{formatIsoId(startIso)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-2">Berakhir</dt>
                  <dd className="text-sm font-medium text-text-1">{formatIsoId(endIso)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-text-2">Jangka waktu</dt>
                  <dd className="text-sm font-medium text-text-1">
                    {log.jangka_bulan ? `${log.jangka_bulan} bulan` : snapshot.periode_kontrak || "-"}
                  </dd>
                </div>
                {remaining !== null && (
                  <div>
                    <dt className="text-xs text-text-2">Sisa</dt>
                    <dd className="text-sm font-medium text-text-1">
                      {remaining > 0
                        ? `${remaining} bulan lagi`
                        : remaining === 0
                          ? "berakhir bulan ini"
                          : `lewat ${Math.abs(remaining)} bulan`}
                    </dd>
                  </div>
                )}
              </dl>
              {snapshot.tanggal_ttd && (
                <p className="mt-4 border-t border-border pt-3 text-sm text-text-2">
                  Ditandatangani: <span className="text-text-1">{snapshot.tanggal_ttd}</span>
                </p>
              )}
            </section>
          )}

          {type === "paklaring" && (
            <section
              aria-labelledby="periode-bekerja-heading"
              className="rounded-lg border border-border bg-surface-1 p-5"
            >
              <h3 id="periode-bekerja-heading" className="text-[15px] font-semibold text-text-1">
                Periode Bekerja
              </h3>
              <p className="mt-1 max-w-prose text-sm text-text-2">
                Dua nilai yang tercetak di surat:{" "}
                <code className="rounded bg-surface-3 px-1 font-mono text-xs">{"{{TANGGAL MASUK}}"}</code>{" "}
                sampai <code className="rounded bg-surface-3 px-1 font-mono text-xs">{"{{today}}"}</code>.
              </p>
              <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-text-2">Masuk</dt>
                  <dd className="text-sm font-medium text-text-1">
                    {formatIsoId(toIsoDate(masukIso))}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-text-2">Keluar</dt>
                  <dd className="text-sm font-medium text-text-1">
                    {formatIsoId(keluarIso)}
                  </dd>
                </div>
              </dl>
            </section>
          )}
        </div>

        <aside className="space-y-4">
          <section
            aria-labelledby="tindakan-heading"
            className="rounded-lg border border-border bg-surface-1 p-5"
          >
            <h3 id="tindakan-heading" className="mb-3 text-[15px] font-semibold text-text-1">
              Tindakan
            </h3>
            <DocumentActions
              size="detail"
              id={log.id}
              docUrl={log.google_doc_url}
              folderId={log.folder_id}
              documentType={type}
              tanggalMulai={startIso}
              jangkaBulan={log.jangka_bulan}
              unfilled={unfilled}
            />
          </section>

          <section
            aria-labelledby="sumber-data-heading"
            className="rounded-lg border border-border bg-surface-1 p-5"
          >
            <h3 id="sumber-data-heading" className="mb-3 text-[15px] font-semibold text-text-1">
              Sumber Data
            </h3>
            <dl className="space-y-2.5 text-sm">
              <div>
                <dt className="text-xs text-text-2">Lini bisnis</dt>
                <dd className="font-medium text-text-1">{log.lini_bisnis || "-"}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-2">Periode payroll</dt>
                <dd className="font-medium text-text-1">
                  {snapshot.payroll_periode || log.periode_bulan || "-"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-2">Kode pada nomor</dt>
                <dd className="flex items-center gap-1.5 font-mono text-xs text-text-1">
                  <Hash className="size-3 shrink-0 text-text-2" aria-hidden="true" />
                  {log.company_code || "-"}
                </dd>
              </div>
            </dl>
          </section>

          <section
            aria-labelledby="status-heading"
            className="rounded-lg border border-border bg-surface-1 p-5"
          >
            <h3 id="status-heading" className="mb-3 text-[15px] font-semibold text-text-1">
              Status
            </h3>
            <dl className="space-y-2.5 text-sm">
              <div>
                <dt className="text-xs text-text-2">Status dokumen</dt>
                <dd className="mt-0.5">
                  <StatusBadge status={log.status_dokumen} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-2">Terakhir diperiksa</dt>
                <dd className="font-medium text-text-1">
                  {log.verified_at
                    ? new Date(log.verified_at).toLocaleString("id-ID", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "Belum pernah"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-text-2">Hasil pemeriksaan</dt>
                <dd className="font-medium text-text-1">
                  {log.verified_at
                    ? unfilled.length
                      ? `${unfilled.length} penanda belum terisi`
                      : "Semua penanda terisi"
                    : "-"}
                </dd>
              </div>
            </dl>
          </section>
        </aside>
      </div>

      {siblings.length > 0 && (
        <section
          aria-labelledby="dokumen-lain-heading"
          className="overflow-hidden rounded-lg border border-border bg-surface-1"
        >
          <h3
            id="dokumen-lain-heading"
            className="border-b border-border px-5 py-4 text-[15px] font-semibold text-text-1"
          >
            Dokumen Lain untuk Karyawan Ini ({siblings.length})
          </h3>
          <ul className="divide-y divide-border">
            {siblings.map((s) => {
              const sEnd = toIsoDate(s.tanggal_berakhir);
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span className="min-w-0 flex-1">
                    <Link
                      href={`/input-dokumen/${s.id}`}
                      className="block truncate font-mono text-xs text-text-1 hover:text-primary"
                    >
                      {s.document_number || "-"}
                    </Link>
                    <span className="block truncate text-xs text-text-2">
                      {new Date(s.created_at).toLocaleDateString("id-ID", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </span>
                  {sEnd && isContractType(s.document_type) ? (
                    <ContractStateBadge tanggalBerakhir={sEnd} />
                  ) : (
                    <span className="text-xs text-text-2">-</span>
                  )}
                  <a
                    href={s.google_doc_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-primary hover:underline"
                  >
                    Buka
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
