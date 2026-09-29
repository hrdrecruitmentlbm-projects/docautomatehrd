"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  UserPlus,
  FileText,
  TriangleAlert,
  Inbox,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { contractMeta, formatIsoId, toIsoDate, monthsUntil } from "@/lib/contract-lifecycle";
import { cn } from "@/lib/utils";

/**
 * Tabel register + seleksi untuk pembuatan massal.
 *
 * Semua filter dihitung di memori dari `rows` yang sudah lengkap, bukan
 * lewat query string. Alasannya: hitungan pada strip attention harus
 * referring to SELURUH data. Kalau difilter di server, setiap kali filter
 * diganti angkanya ikut berubah dan strip jadi tidak berguna sebagai
 * peta.
 *
 * "//Buat untuk terpilih" mengantar ke /generate/bulk dengan daftar nama
 * key di query — jadi refresh tidak menghilangkan pilihan.
 */

const STATE_FILTERS = [
  { key: "semua", label: "Semua" },
  { key: "segera", label: "Segera berakhir" },
  { key: "belum", label: "Belum ada kontrak" },
  { key: "kedaluwarsa", label: "Kedaluwarsa" },
  { key: "aktif", label: "Aktif" },
];

const SORTS = [
  { key: "nama", label: "Nama" },
  { key: "status", label: "Status kontrak" },
  { key: "baru", label: "Karyawan baru" },
];

const PAGE_SIZE = 50;

export default function RegisterTable({
  rows,
  now,
  lines,
  counts,
  missingPayroll,
  initialState = "semua",
  initialLine = "",
  truncated,
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [stateFilter, setStateFilter] = React.useState(initialState);
  const [line, setLine] = React.useState(initialLine);
  const [onlyNoPayroll, setOnlyNoPayroll] = React.useState(false);
  const [sort, setSort] = React.useState("nama");
  const [page, setPage] = React.useState(1);
  const [selected, setSelected] = React.useState(() => new Set());

  // Navigasi dari KPI dashboard (/kontrak?state=belum) mengubah initialState.
  // React-endorsed pattern: adjust state saat render, bukan di effect —
  // sama seperti AppShell.jsxVjhte adjustment saat render untuk drawer.
  const [prevInitial, setPrevInitial] = React.useState({ state: initialState, line: initialLine });
  if (initialState !== prevInitial.state || initialLine !== prevInitial.line) {
    setPrevInitial({ state: initialState, line: initialLine });
    setStateFilter(initialState);
    setLine(initialLine);
    setPage(1);
  }
  const filtered = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    let out = rows.filter((r) => {
      if (term) {
        const hay = `${r.nama_asli} ${r.posisi || ""} ${r.divisi || ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      if (stateFilter !== "semua" && r.stateKey !== stateFilter) return false;
      if (line && (r.lini_bisnis || "") !== line) return false;
      if (onlyNoPayroll && r.hasPayroll) return false;
      return true;
    });

    const rank = { segera: 0, belum: 1, kedaluwarsa: 2, aktif: 3, terbuka: 4 };
    if (sort === "nama") {
      out = [...out].sort((a, b) => a.nama_asli.localeCompare(b.nama_asli, "id"));
    } else if (sort === "status") {
      out = [...out].sort(
        (a, b) =>
          rank[a.stateKey] - rank[b.stateKey] ||
          a.nama_asli.localeCompare(b.nama_asli, "id")
      );
    } else {
      out = [...out].sort(
        (a, b) => String(b.tanggal_masuk || "").localeCompare(String(a.tanggal_masuk || ""))
      );
    }
    return out;
  }, [rows, query, stateFilter, line, onlyNoPayroll, sort]);

  // Paginasi dijepit, bukan di-reset lewat effect: kalau filter menyempit,
  // halaman efektif menyusut sendiri dan baris tak pernah "hilang" di
  // halaman 4 dari hasil yang sudah tidak ada.
  const maxPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, maxPage);
  const visible = filtered.slice(0, safePage * PAGE_SIZE);
  const selectedCount = selected.size;

  const changeFilter = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  const toggle = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAllOnPage = () => {
    const keys = visible.map((r) => r.nama_key);
    const allSelected = keys.every((k) => selected.has(k));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const k of keys) {
        if (allSelected) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  };

  const startBulk = () => {
    const keys = rows.filter((r) => selected.has(r.nama_key)).map((r) => r.nama_key);
    router.push(`/generate/bulk?keys=${encodeURIComponent(keys.join(","))}`);
  };

  // Hanya kontrak yang hilang atau hampir habis yang masuk aksi ini — yang
  // berstatus "aktif" tidak butuh kontrak kedua, dan thankfully tidak membingungkan.
  const actionable = filtered.filter((r) =>
    ["belum", "segera", "kedaluwarsa"].includes(r.stateKey)
  );
  return (
    <div className="space-y-4">
      {/* Attention strip: klik = filter tabel. Angka dihitung dari seluruh
          himpunan, jadi tetap jujur saat filter lain aktif. */}
      <section aria-label="Ringkasan status kontrak" className="space-y-2">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {STATE_FILTERS.filter((f) => f.key !== "semua").map((f) => {
            const meta = contractMeta(f.key);
            const n = counts[f.key] || 0;
            const active = stateFilter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => {
                  setStateFilter(active ? "semua" : f.key);
                  setPage(1);
                }}                aria-pressed={active}
                className={cn(
                  "flex min-h-[72px] flex-col items-start rounded-lg border p-3.5 text-left transition-colors",
                  active
                    ? "border-primary bg-brand-wash"
                    : "border-border bg-surface-1 hover:bg-surface-2"
                )}
              >
                <span className="flex items-center gap-1.5 text-xs font-medium text-text-2">
                  <span className={cn("size-2 shrink-0 rounded-full", meta.dot)} aria-hidden="true" />
                  {f.label}
                </span>
                <span
                  className={cn(
                    "mt-1.5 text-2xl font-semibold leading-none tabular",
                    active ? "text-brand-wash-ink" : "text-text-1"
                  )}
                >
                  {n.toLocaleString("id-ID")}
                </span>
              </button>
            );
          })}
          <div className="flex min-h-[72px] flex-col items-start rounded-lg border border-border bg-surface-1 p-3.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-text-2">
              <Users className="size-3.5 shrink-0" aria-hidden="true" />
              Total karyawan
            </span>
            <span className="mt-1.5 text-2xl font-semibold leading-none tabular text-text-1">
              {rows.length.toLocaleString("id-ID")}
            </span>
          </div>
        </div>
        {truncated && (
          <p className="text-xs text-text-2">
            Daftar dipangkas pada 2.000 baris. Bila jumlah karyawan lebih dari
            itu, angka di atas tidak mencakup sisanya.
          </p>
        )}
      </section>

      {/* Filter bar */}
      <section className="rounded-lg border border-border bg-surface-1 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-2"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(e) => changeFilter(setQuery)(e.target.value)}
              placeholder="Cari nama, posisi, atau divisi..."
              className="h-9 pl-9"
              aria-label="Cari karyawan"
            />
          </div>

          <select
            value={line}
            onChange={(e) => changeFilter(setLine)(e.target.value)}
            aria-label="Filter lini bisnis"
            className="h-9 rounded-md border border-border bg-surface-1 px-2.5 text-sm text-text-1"
          >
            <option value="">Semua lini bisnis</option>
            {lines.map((l) => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>

          <select
            value={sort}
            onChange={(e) => changeFilter(setSort)(e.target.value)}
            aria-label="Urutan"
            className="h-9 rounded-md border border-border bg-surface-1 px-2.5 text-sm text-text-1"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>Urut: {s.label}</option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setOnlyNoPayroll((v) => !v);
              setPage(1);
            }}
            aria-pressed={onlyNoPayroll}
            className={cn(
              "flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium transition-colors",
              onlyNoPayroll
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-border bg-surface-1 text-text-1 hover:bg-surface-2"
            )}
          >
            <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
            Tanpa payroll ({missingPayroll})
          </button>

          {(query || line || stateFilter !== "semua" || onlyNoPayroll) && (
            <Button
              variant="outline"
              className="h-9"
              onClick={() => {
                setQuery("");
                setLine("");
                setStateFilter("semua");
                setOnlyNoPayroll(false);
              }}
            >
              Reset
            </Button>
          )}
        </div>

        <p className="mt-3 text-xs text-text-2" role="status">
          Menampilkan {visible.length} dari {filtered.length} karyawan
          {rows.length !== filtered.length && ` (dari ${rows.length} total)`}
        </p>
      </section>

      {/* Bulk action bar — only when something is picked */}
      {selectedCount > 0 && (
        <div className="sticky top-14 z-(--z-sticky) flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-brand-wash px-4 py-3">
          <p className="text-sm font-medium text-brand-wash-ink">
            {selectedCount} karyawan dipilih
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="h-9" onClick={() => setSelected(new Set())}>
              Batal pilih
            </Button>
            <Button className="h-9" onClick={startBulk}>
              <UserPlus className="mr-2 size-4" aria-hidden="true" />
              Buat untuk terpilih
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface-1 px-6 py-14 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-surface-2">
            <Inbox className="size-6 text-text-2" aria-hidden="true" />
          </div>
          <h2 className="mb-1 text-sm font-semibold text-text-1">Master karyawan masih kosong</h2>
          <p className="mb-5 max-w-sm text-sm text-text-2">
            Register menampilkan semua karyawan dari master. Sync master dulu di
            halaman Data.
          </p>
          <Link
            href="/data"
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Buka halaman Data
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-border bg-surface-1 px-6 py-12 text-center">
          <p className="mb-1 text-sm font-semibold text-text-1">Tidak ada karyawan yang cocok</p>
          <p className="mb-4 text-sm text-text-2">
            Coba kata kunci lain, atau reset filter di atas.
          </p>
          <Button
            variant="outline"
            className="h-9"
            onClick={() => {
              setQuery("");
              setLine("");
              setStateFilter("semua");
              setOnlyNoPayroll(false);
            }}
          >
            Reset filter
          </Button>
        </div>
      ) : (
        <section className="overflow-hidden rounded-lg border border-border bg-surface-1">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Register kontrak karyawan. Menampilkan {visible.length} dari{" "}
                {filtered.length} karyawan beserta status kontrak terakhirnya.
              </caption>
              <thead>
                <tr className="border-y border-border text-xs font-medium text-text-2">
                  <th scope="col" className="w-10 px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={
                        visible.length > 0 &&
                        visible.every((r) => selected.has(r.nama_key))
                      }
                      onChange={toggleAllOnPage}
                      aria-label="Pilih semua di halaman ini"
                      className="size-4 rounded border-border"
                    />
                  </th>
                  <th scope="col" className="px-2 py-2.5 text-left">Karyawan</th>
                  <th scope="col" className="hidden px-4 py-2.5 text-left md:table-cell">
                    Posisi / Divisi
                  </th>
                  <th scope="col" className="hidden px-4 py-2.5 text-left lg:table-cell">
                    Lini bisnis
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-left">Status kontrak</th>
                  <th scope="col" className="hidden px-4 py-2.5 text-left lg:table-cell">
                    Berakhir
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const meta = contractMeta(r.stateKey);
                  const end = r.contract ? toIsoDate(r.contract.tanggal_berakhir) : null;
                  const remaining = monthsUntil(end, new Date(now));
                  return (
                    <tr
                      key={r.nama_key}
                      className={cn(
                        "border-b border-row-border transition-colors last:border-b-0 hover:bg-surface-0",
                        selected.has(r.nama_key) && "bg-brand-wash/40"
                      )}
                    >
                      <td className="px-4 py-2.5">
                        <input
                          type="checkbox"
                          checked={selected.has(r.nama_key)}
                          onChange={() => toggle(r.nama_key)}
                          aria-label={`Pilih ${r.nama_asli}`}
                          className="size-4 rounded border-border"
                        />
                      </td>
                      <td className="px-2 py-2.5">
                        <span className="block truncate font-medium text-text-1">
                          {r.nama_asli}
                        </span>
                        {/* Restack below md, where Posisi/Divisi hides. */}
                        <span className="block truncate text-xs text-text-2 md:hidden">
                          {[r.posisi, r.divisi].filter(Boolean).join(" · ") || "-"}
                        </span>
                        {!r.hasPayroll && (
                          <span className="mt-0.5 inline-flex items-center gap-1 text-xs text-amber-700">
                            <TriangleAlert className="size-3 shrink-0" aria-hidden="true" />
                            Payroll belum ada
                          </span>
                        )}
                      </td>
                      <td className="hidden max-w-[220px] truncate px-4 py-2.5 text-text-2 md:table-cell">
                        {[r.posisi, r.divisi].filter(Boolean).join(" · ") || "-"}
                      </td>
                      <td className="hidden px-4 py-2.5 text-text-2 lg:table-cell">
                        {r.lini_bisnis || "-"}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={cn(
                            "inline-flex h-5 items-center rounded-full px-2 text-xs font-medium",
                            meta.className
                          )}
                        >
                          {meta.label}
                        </span>
                        {r.contract && (
                          <span className="mt-0.5 block truncate font-mono text-xs text-text-2">
                            {r.contract.document_number}
                          </span>
                        )}
                      </td>
                      <td className="hidden px-4 py-2.5 text-text-2 lg:table-cell">
                        {end ? (
                          <>
                            <span className="block tabular">{formatIsoId(end)}</span>
                            {remaining !== null && remaining > 0 && (
                              <span className="block text-xs text-text-2">
                                {remaining} bulan lagi
                              </span>
                            )}
                          </>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          {r.contract && (
                            <Link
                              href={`/input-dokumen/${r.contract.id}`}
                              className="text-sm font-medium text-primary hover:underline"
                            >
                              Rincian
                            </Link>
                          )}
                          <Link
                            href={`/generate/pkwt`}
                            className="relative inline-flex size-9 items-center justify-center rounded-md text-text-2 transition-colors hover:bg-surface-2 hover:text-text-1 after:absolute after:-inset-1 after:content-['']"
                            aria-label={`Buat kontrak untuk ${r.nama_asli}`}
                            title="Buat kontrak baru"
                          >
                            <FileText className="size-4" aria-hidden="true" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {visible.length < filtered.length && (
            <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3.5">
              <p className="text-xs tabular text-text-2">
                Menampilkan {visible.length.toLocaleString("id-ID")} dari{" "}
                {filtered.length.toLocaleString("id-ID")} karyawan
              </p>
              <Button variant="outline" className="h-9" onClick={() => setPage((p) => p + 1)}>
                Muat lebih banyak
              </Button>
            </div>
          )}

          {actionable.length > 0 && selectedCount === 0 && (
            <p className="border-t border-border px-5 py-3 text-xs text-text-2">
              {actionable.length} karyawan butuh kontrak baru atau perpanjangan.
              Centang beberapa untuk dibuat sekaligus, atau buka satu per satu.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
