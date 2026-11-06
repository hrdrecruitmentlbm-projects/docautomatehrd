"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  Clock,
  Plus,
  ExternalLink,
  CheckCircle2,
  X,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/**
 * Komponen Notifikasi Kontrak PKWT di Header AppShell (TAHAP 6).
 *
 * Menampilkan:
 * 1. Ikon lonceng dengan badge jumlah kontrak yang perlu ditindaklanjuti.
 * 2. Tiga kelompok: "Berakhir dalam 7 hari", "Berakhir dalam 30 hari", "Sudah berakhir dan belum diperpanjang".
 * 3. Tombol "Buat PKWT perpanjangan" (prefill karyawan & tanggal mulai H+1).
 * 4. Opsi "Tunda 7 hari" yang menyimpan ke tabel pkwt_notif_state secara idempotent.
 */
export function NotificationBell({ initialNotifications }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);

  // Inisialisasi tab aktif secara lazy tanpa setState di effect
  const [activeTab, setActiveTab] = React.useState(() => {
    if (initialNotifications?.counts?.h7 > 0) return "h7";
    if (initialNotifications?.counts?.h30 > 0) return "h30";
    if (initialNotifications?.counts?.expired > 0) return "expired";
    return "h7";
  });

  // Pelacakan status tunda / dismissed lokal untuk feedback UI instan
  const [dismissedKeys, setDismissedKeys] = React.useState(() => new Set());
  const [snoozingKeys, setSnoozingKeys] = React.useState(() => new Set());

  const popoverRef = React.useRef(null);
  const triggerRef = React.useRef(null);

  // Ambil data dasar dari prop server
  const baseItems = initialNotifications?.items || { h7: [], h30: [], expired: [] };

  // Filter kontrak yang baru saja ditunda oleh pengguna di sesi aktif ini
  const itemsH7 = React.useMemo(
    () =>
      (baseItems.h7 || []).filter(
        (it) => !dismissedKeys.has(`${it.nama_key}|${it.tanggal_berakhir}`)
      ),
    [baseItems.h7, dismissedKeys]
  );

  const itemsH30 = React.useMemo(
    () =>
      (baseItems.h30 || []).filter(
        (it) => !dismissedKeys.has(`${it.nama_key}|${it.tanggal_berakhir}`)
      ),
    [baseItems.h30, dismissedKeys]
  );

  const itemsExpired = React.useMemo(
    () =>
      (baseItems.expired || []).filter(
        (it) => !dismissedKeys.has(`${it.nama_key}|${it.tanggal_berakhir}`)
      ),
    [baseItems.expired, dismissedKeys]
  );

  const total = itemsH7.length + itemsH30.length + itemsExpired.length;

  const currentItems =
    activeTab === "h7" ? itemsH7 : activeTab === "h30" ? itemsH30 : itemsExpired;

  // Tutup panel bila pengguna klik di luar
  React.useEffect(() => {
    if (!open) return;
    function handleClickOutside(event) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Tutup panel dengan tombol Escape
  React.useEffect(() => {
    if (!open) return;
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  // Fungsi Tunda 7 Hari
  async function handleSnooze(item) {
    const key = `${item.nama_key}|${item.tanggal_berakhir}`;
    if (snoozingKeys.has(key)) return;

    setSnoozingKeys((prev) => new Set(prev).add(key));

    try {
      const res = await fetch("/api/pkwt-notif/snooze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nama_key: item.nama_key,
          tanggal_berakhir: item.tanggal_berakhir,
          days: 7,
        }),
      });

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Gagal menunda notifikasi");
      }

      // Hapus kartu dari tampilan lokal secara optimis
      setDismissedKeys((prev) => new Set(prev).add(key));
      toast.success(`Notifikasi ${item.nama_asli} ditunda selama 7 hari`);
      router.refresh();
    } catch (err) {
      toast.error(err.message || "Gagal menunda notifikasi");
    } finally {
      setSnoozingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  return (
    <div className="relative inline-block">
      {/* Tombol Lonceng Header */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative flex size-9 shrink-0 items-center justify-center rounded-md text-text-2 transition-colors hover:bg-surface-2 hover:text-text-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          open && "bg-surface-2 text-text-1"
        )}
        aria-label={`Notifikasi kontrak PKWT: ${total} kontrak perlu ditindaklanjuti`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell className="size-5" />

        {/* Badge Angka Kontrak yang Perlu Ditindaklanjuti */}
        {total > 0 && (
          <span className="absolute -top-1 -right-1 flex min-w-5 h-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white shadow-xs">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {/* Popover Dropdown Notifikasi */}
      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Panel Notifikasi Kontrak PKWT"
          className="absolute right-0 top-full mt-2 w-[340px] sm:w-[420px] rounded-xl border border-border bg-surface-0 shadow-2xl ring-1 ring-black/5 z-50 text-text-1 animate-in fade-in-0 zoom-in-95 duration-150"
        >
          {/* Header Panel */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3 bg-surface-1/50 rounded-t-xl">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Bell className="size-4 text-primary" />
                <h3 className="text-sm font-semibold text-text-1">
                  Notifikasi Kontrak PKWT
                </h3>
              </div>
              <p className="text-xs text-text-2 mt-0.5 truncate">
                {total > 0
                  ? `${total} kontrak perlu ditindaklanjuti`
                  : "Semua kontrak aman, tidak ada tindakan"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="size-7 rounded-md flex items-center justify-center text-text-2 hover:bg-surface-2 hover:text-text-1"
              aria-label="Tutup notifikasi"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* 3 Kelompok Tab Sesuai Spesifikasi */}
          <div className="grid grid-cols-3 border-b border-border bg-surface-1/30 p-1 gap-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab("h7")}
              className={cn(
                "flex flex-col items-center justify-center py-1.5 px-2 rounded-lg transition-colors",
                activeTab === "h7"
                  ? "bg-surface-0 text-text-1 shadow-xs font-semibold"
                  : "text-text-2 hover:bg-surface-2 hover:text-text-1"
              )}
            >
              <span className="truncate">Berakhir 7 Hari</span>
              <span
                className={cn(
                  "mt-0.5 inline-block rounded-full px-1.5 py-0.2 text-[10px] font-semibold",
                  itemsH7.length > 0
                    ? "bg-red-100 text-red-700 font-bold"
                    : "bg-surface-2 text-text-2"
                )}
              >
                {itemsH7.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("h30")}
              className={cn(
                "flex flex-col items-center justify-center py-1.5 px-2 rounded-lg transition-colors",
                activeTab === "h30"
                  ? "bg-surface-0 text-text-1 shadow-xs font-semibold"
                  : "text-text-2 hover:bg-surface-2 hover:text-text-1"
              )}
            >
              <span className="truncate">Berakhir 30 Hari</span>
              <span
                className={cn(
                  "mt-0.5 inline-block rounded-full px-1.5 py-0.2 text-[10px] font-semibold",
                  itemsH30.length > 0
                    ? "bg-amber-100 text-amber-800 font-bold"
                    : "bg-surface-2 text-text-2"
                )}
              >
                {itemsH30.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("expired")}
              className={cn(
                "flex flex-col items-center justify-center py-1.5 px-2 rounded-lg transition-colors",
                activeTab === "expired"
                  ? "bg-surface-0 text-text-1 shadow-xs font-semibold"
                  : "text-text-2 hover:bg-surface-2 hover:text-text-1"
              )}
            >
              <span className="truncate">Sudah Berakhir</span>
              <span
                className={cn(
                  "mt-0.5 inline-block rounded-full px-1.5 py-0.2 text-[10px] font-semibold",
                  itemsExpired.length > 0
                    ? "bg-rose-100 text-rose-700 font-bold"
                    : "bg-surface-2 text-text-2"
                )}
              >
                {itemsExpired.length}
              </span>
            </button>
          </div>

          {/* Daftar Kontrak dalam Tab Aktif */}
          <div className="max-h-[350px] overflow-y-auto divide-y divide-border/60 p-2 space-y-2">
            {currentItems.length === 0 ? (
              <div className="py-8 text-center text-text-2">
                <CheckCircle2 className="mx-auto size-8 text-emerald-600 mb-2 opacity-80" />
                <p className="text-sm font-medium text-text-1">Tidak ada kontrak</p>
                <p className="text-xs text-text-2 mt-0.5">
                  {activeTab === "h7"
                    ? "Tidak ada kontrak yang berakhir dalam 7 hari ke depan."
                    : activeTab === "h30"
                    ? "Tidak ada kontrak yang berakhir dalam rentang 8-30 hari."
                    : "Tidak ada kontrak yang kedaluwarsa tanpa perpanjangan."}
                </p>
              </div>
            ) : (
              currentItems.map((item) => {
                const isSnoozing = snoozingKeys.has(
                  `${item.nama_key}|${item.tanggal_berakhir}`
                );

                // Buat link perpanjangan dengan prefill karyawan dan tanggal mulai baru
                const renewalHref = `/generate/pkwt?employee=${encodeURIComponent(
                  item.nama_key
                )}&nama=${encodeURIComponent(
                  item.nama_asli || ""
                )}&start=${encodeURIComponent(item.next_start || "")}`;

                return (
                  <div
                    key={`${item.id}_${item.tanggal_berakhir}`}
                    className="p-2.5 rounded-lg border border-border bg-surface-1/40 hover:bg-surface-1/80 transition-colors"
                  >
                    {/* Baris Atas: Nama Karyawan & Sisa Hari */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-sm text-text-1 truncate">
                            {item.nama_asli}
                          </span>
                          {item.kode_perusahaan && (
                            <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-text-2">
                              {item.kode_perusahaan}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-text-2 truncate mt-0.5">
                          {item.nomor_surat !== "-" ? item.nomor_surat : "No. Surat Arsip"}
                        </p>
                      </div>

                      {/* Pill Status Sisa Hari */}
                      <span
                        className={cn(
                          "shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium",
                          item.sisa_hari < 0
                            ? "bg-rose-100 text-rose-800"
                            : item.sisa_hari <= 7
                            ? "bg-red-100 text-red-800"
                            : "bg-amber-100 text-amber-800"
                        )}
                      >
                        {item.sisa_hari < 0
                          ? `Lewat ${Math.abs(item.sisa_hari)} hari`
                          : item.sisa_hari === 0
                          ? "Berakhir hari ini"
                          : `${item.sisa_hari} hari lagi`}
                      </span>
                    </div>

                    {/* Baris Tengah: Tanggal & Info */}
                    <div className="mt-2 flex items-center justify-between text-xs text-text-2">
                      <span>Berakhir: {item.tanggal_berakhir_id || item.tanggal_berakhir}</span>
                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                        >
                          <FileText className="size-3" />
                          Dokumen
                          <ExternalLink className="size-2.5" />
                        </a>
                      )}
                    </div>

                    {/* Baris Bawah: Tombol Tindakan */}
                    <div className="mt-3 flex items-center gap-2 pt-2 border-t border-border/50">
                      {/* Tombol Buat PKWT Perpanjangan */}
                      <Link
                        href={renewalHref}
                        onClick={() => setOpen(false)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                      >
                        <Plus className="size-3.5" />
                        Buat perpanjangan
                      </Link>

                      {/* Tombol Opsi Tunda 7 Hari */}
                      <button
                        type="button"
                        disabled={isSnoozing}
                        onClick={() => handleSnooze(item)}
                        title="Tunda pengingat kontrak ini selama 7 hari"
                        className="inline-flex items-center justify-center gap-1 rounded-md border border-border bg-surface-0 px-2 py-1.5 text-xs font-medium text-text-2 transition-colors hover:bg-surface-2 hover:text-text-1 disabled:opacity-50"
                      >
                        <Clock className="size-3" />
                        <span>{isSnoozing ? "Menunda..." : "Tunda 7 hari"}</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Panel */}
          <div className="border-t border-border bg-surface-1/40 px-3 py-2 text-[11px] text-text-2 rounded-b-xl flex items-center justify-between">
            <span className="truncate">
              Notifikasi hilang otomatis setelah perpanjangan dibuat.
            </span>
            <Link
              href="/kontrak"
              onClick={() => setOpen(false)}
              className="font-medium text-primary hover:underline shrink-0 ml-2"
            >
              Lihat semua
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
