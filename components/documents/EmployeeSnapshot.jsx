import Link from "next/link";
import { formatRp, formatTanggalId } from "@/lib/pkwt";

/**
 * Tiga kartu: Data Pribadi | Payroll | Perusahaan.
 *
 * Dipakai oleh langkah "Verifikasi data" di PkwtAutoForm (data LIVE dari
 * master+payroll) dan oleh halaman Rincian (data ARSIP dari form_data).
 * Keduanya sengaja memakai komponen yang sama supaya tampilan tidak
 * berbeda, meski sumber datanya berbeda.
 */

function Field({ label, children, mono }) {
  return (
    <div>
      <dt className="text-xs text-text-2">{label}</dt>
      <dd className={mono ? "font-mono text-sm font-medium text-text-1" : "text-sm font-medium text-text-1"}>
        {children}
      </dd>
    </div>
  );
}

function Card({ title, children, sub }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 p-4">
      <h3 className="mb-2 text-[13px] font-semibold text-text-1">
        {title}
        {sub ? <span className="font-normal text-text-2"> · {sub}</span> : null}
      </h3>
      {children}
    </div>
  );
}

export function EmployeeSnapshot({ employee, payroll, company, archived = false }) {
  const emp = employee || {};
  const pay = payroll || null;
  const hasPayroll = pay && Object.keys(pay).length > 0;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <Card title="Data Pribadi">
        <dl className="space-y-1.5 text-sm">
          <Field label="Nama">{emp.nama_asli || "-"}</Field>
          <Field label="TTL">
            {[emp.tempat_lahir, formatTanggalId(emp.tanggal_lahir)]
              .filter(Boolean)
              .join(", ") || "-"}
          </Field>
          <Field label="Alamat">{emp.alamat_tinggal || "-"}</Field>
          <Field label="No. KTP" mono>{emp.no_ktp || "-"}</Field>
          <Field label="Posisi / Divisi">
            {[emp.posisi, emp.divisi].filter(Boolean).join(" · ") || "-"}
          </Field>
        </dl>
      </Card>

      <Card title="Payroll" sub={hasPayroll ? pay.periode_bulan : undefined}>
        {hasPayroll ? (
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-text-2">Gapok</dt>
              <dd className="font-semibold tabular text-text-1">{formatRp(pay.gapok)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-2">U. Makan</dt>
              <dd className="font-medium tabular text-text-1">{formatRp(pay.u_makan)}/hari</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-2">U. Transport</dt>
              <dd className="font-medium tabular text-text-1">{formatRp(pay.u_transport)}/hari</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-2">T. Jabatan</dt>
              <dd className="font-medium tabular text-text-1">{formatRp(pay.t_jabatan)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-2">T. Fungsional</dt>
              <dd className="font-medium tabular text-text-1">{formatRp(pay.t_fungsional)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-2">T. Kesehatan</dt>
              <dd className="font-medium tabular text-text-1">{formatRp(pay.t_kesehatan)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-text-2">T. Transport</dt>
              <dd className="font-medium tabular text-text-1">{formatRp(pay.t_transport)}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-amber-700">
            {archived
              ? "Payroll tidak tersimpan saat dokumen ini dibuat."
              : "Payroll belum ada. Impor payroll dulu di halaman Data; komponen akan terisi Rp 0,-."}{" "}
            <Link href="/data" className="text-primary hover:underline">Halaman Data</Link>
          </p>
        )}
      </Card>

      <Card title="Perusahaan">
        <dl className="space-y-1.5 text-sm">
          <Field label="Lini Bisnis">{emp.lini_bisnis || "-"}</Field>
          <Field label="Kode KOP" mono>{company?.code || "-"}</Field>
          <div>
            <dt className="text-xs text-text-2">Status KOP</dt>
            <dd className="mt-0.5">
              <span
                className={
                  company?.hasKop
                    ? "inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700"
                    : "inline-block rounded-full px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700"
                }
              >
                {company?.hasKop ? "Ada KOP" : "Tanpa KOP (tambah manual)"}
              </span>
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
