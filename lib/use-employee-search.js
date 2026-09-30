"use client";

import { useEffect, useRef, useState } from "react";
import { readJson } from "@/lib/http";

/**
 * State machine pencarian karyawan — dipakai bersama oleh PkwtAutoForm dan
 * PaklaringAutoForm.
 *
 * Kenapa hook, bukan komponen: logika ini (debounce 300ms + AbortController,
 * daftar opsi yang di-drop saat ketikan berubah, navigasi keyboard combobox
 * dengan aria-activedescendant) adalah bagian paling halus dari form ini dan
 * paling mudah salah kalau disalin. Yang tersisa untuk tiap form hanyalah
 * markup — penanda id dan copy sudah jelas berbeda.
 *
 * Aturan yang dijaga di sini (bukan di pemanggil):
 *   - Respons basi tidak pernah mendarat: setiap pencarian membatalkan yang
 *     sebelumnya sebelum fetch.
 *   - `searched` membedakan "sudah cari, nihil" dari "belum cari" supaya UI
 *     tidak menampilkan "tidak ada hasil" sebelum pengguna mengetik apa pun.
 *   - Kegagalan = state dengan tombol ulang, BUKAN toast. Notifikasi toast
 *     untuk hal yang bisa dicoba lagi hanya menambah kebisingan.
 *
 * @returns objek state + aksi untuk form
 */
export function useEmployeeSearch() {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [selectedKey, setSelectedKey] = useState("");
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState(null);

  const debounceRef = useRef(null);
  const abortRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const runSearch = async (term) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(`/api/employees?q=${encodeURIComponent(term)}&limit=10`, {
        signal: controller.signal,
      });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || "Gagal mencari karyawan");
      if (!mountedRef.current || controller.signal.aborted) return;
      setOptions(data.employees || []);
      setActiveIdx(-1);
      setSearched(true);
    } catch (e) {
      if (e.name === "AbortError") return;
      if (!mountedRef.current) return;
      // Search failure is an inline state with retry, not a toast.
      setSearchError(e.message);
      setOptions([]);
      setSearched(true);
    } finally {
      if (mountedRef.current && !controller.signal.aborted) setSearching(false);
    }
  };

  // Debounce: jangan memanggil API pada setiap ketikan. Dibersihkan saat
  // komponen unmount supaya tidak ada setState setelah unmount.
  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    debounceRef.current = setTimeout(() => runSearch(term), 300);
    return () => {
      clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  /** Dipanggil tiap ketikan berubah: pilihan lama langsung dibuang. */
  const onQueryChange = (value) => {
    setQuery(value);
    setSelectedKey("");
    setDetail(null);
    setDetailError(null);
    if (value.trim().length < 2) {
      clearTimeout(debounceRef.current);
      abortRef.current?.abort();
      setOptions([]);
      setSearching(false);
      setSearched(false);
      setSearchError(null);
      setActiveIdx(-1);
    } else {
      // Drop stale options immediately; skeleton covers the debounce gap.
      setOptions([]);
      setActiveIdx(-1);
      setSearched(false);
    }
  };

  /** Ambil detail karyawan terpilih (personal + payroll + perusahaan). */
  const pickEmployee = async (key, nama) => {
    setSelectedKey(key);
    setQuery(nama);
    setOptions([]);
    setActiveIdx(-1);
    setSearched(false);
    setDetail(null);
    setDetailError(null);
    setLoadingDetail(true);
    try {
      const res = await fetch(`/api/employee-detail?key=${encodeURIComponent(key)}`);
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || "Gagal memuat data karyawan");
      if (mountedRef.current) setDetail(data);
    } catch (e) {
      if (mountedRef.current) setDetailError(e.message);
    } finally {
      if (mountedRef.current) setLoadingDetail(false);
    }
  };

  /** Combobox keyboard: arrows move, Enter picks, Esc closes. */
  const onSearchKeyDown = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIdx >= 0 && options[activeIdx]) {
      e.preventDefault();
      pickEmployee(options[activeIdx].nama_key, options[activeIdx].nama_asli);
    } else if (e.key === "Escape") {
      setOptions([]);
      setActiveIdx(-1);
    }
  };

  /** Kembalikan form ke keadaan awal setelah berhasil membuat dokumen. */
  const reset = () => {
    setSelectedKey("");
    setQuery("");
    setDetail(null);
    setDetailError(null);
    setOptions([]);
    setSearched(false);
    setSearchError(null);
    setActiveIdx(-1);
  };

  return {
    query,
    options,
    searching,
    searched,
    searchError,
    activeIdx,
    selectedKey,
    detail,
    loadingDetail,
    detailError,
    runSearch,
    onQueryChange,
    pickEmployee,
    onSearchKeyDown,
    reset,
    //-shortcuts buat penanda id yang unik per form
    idBase: "emp",
  };
}
