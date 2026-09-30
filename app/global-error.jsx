"use client"; // global-error must be a Client Component

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Copy, Check, LogOut } from "lucide-react";

/**
 * Root error boundary — menangkap error yang TIDAK bisa ditangkap
 * app/(app)/error.jsx.
 *
 * Kenapa ini penting: error dari komponen CLIENT yang melempar saat
 * event (bukan saat render server) membuat React melepas seluruh
 * pohon. Tanpa boundary ini, yang tampil adalah halaman fallback
 * platform: layar hitam bertuliskan "This page couldn't load" — tanpa
 * pesan, tanpa jejak, tanpa jalan keluar selain tombol Back.
 *
 * experienced satu itu berkali-kali. Bug menu avatar, pil status, dan
 * menu baris semuanya begitu: gejalanya_IDENTIK (layar hitam) sementara
 * penyebabnya sama sekali berbeda. Boundary ini mengubahnya dari
 * "tidak ada informasi sama sekali" jadi "ada pesan dan ada tombol".
 *
 * Karena ini yang TERAKHIR, isinya harus benar-benar mandiri:Own
 * <html>/<body> sendiri, tanpa Provider, tanpa hook router, tanpa
 * dependensi dari context aplikasi.
 */
export default function GlobalError({ error, reset }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    console.error("Global error:", error);
  }, [error]);

  const message = error?.message || "(tanpa pesan)";
  const digest = error?.digest;
  const detail = [message, digest ? `digest: ${digest}` : null]
    .filter(Boolean)
    .join("\n");

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(detail);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard tidak tersedia — tidak kritikal */
    }
  };

  return (
    <html lang="id">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          background: "#f4f6f5",
          color: "#1a1d1c",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        }}
      >
        <main style={{ maxWidth: "34rem", textAlign: "center" }}>
          <div
            aria-hidden="true"
            style={{
              width: "3rem",
              height: "3rem",
              margin: "0 auto 1rem",
              borderRadius: "9999px",
              background: "#fde8e8",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AlertTriangle size={24} color="#c53030" />
          </div>

          <h1 style={{ fontSize: "1.05rem", fontWeight: 600, margin: "0 0 0.35rem" }}>
            Aplikasi gagal dimuat
          </h1>
          <p
            style={{
              fontSize: "0.875rem",
              color: "#4b5452",
              margin: "0 0 1.25rem",
              lineHeight: 1.5,
            }}
          >
            Terjadi kesalahan di luar halaman ini. Coba muat ulang, atau keluar
            lalu masuk kembali bila masalahnya relate ke akun.
          </p>

          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => reset()}
              style={{
                height: "2.25rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
                padding: "0 1rem",
                borderRadius: "0.375rem",
                border: "none",
                background: "#0f7a52",
                color: "#fff",
                fontSize: "0.875rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              <RefreshCw size={16} />
              Muat ulang
            </button>

            {/* Jalur keluar yang tidak bergantung pada menu mana pun —
                dropdown pernah gagal dibuka, dan tanpa ini pengguna
                terkunci. Sengaja <a>, bukan <Link>: /api/auth/signout
                adalah halaman HTML dengan form POST, bukan route RSC,
                jadi navigasi sisi-klien akan gagal. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/api/auth/signout"
              style={{
                height: "2.25rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
                padding: "0 1rem",
                borderRadius: "0.375rem",
                border: "1px solid #d5dbd9",
                background: "#fff",
                color: "#1a1d1c",
                fontSize: "0.875rem",
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              <LogOut size={16} />
              Keluar
            </a>
          </div>

          <details style={{ marginTop: "1.5rem", textAlign: "left" }}>
            <summary
              style={{
                cursor: "pointer",
                fontSize: "0.75rem",
                color: "#6b7472",
                userSelect: "none",
              }}
            >
              Detail teknis
            </summary>
            <pre
              style={{
                marginTop: "0.5rem",
                padding: "0.75rem",
                borderRadius: "0.375rem",
                background: "#fff",
                border: "1px solid #e3e7e6",
                fontSize: "0.75rem",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}
            >
              {detail}
            </pre>
            <button
              type="button"
              onClick={onCopy}
              style={{
                marginTop: "0.5rem",
                height: "2rem",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0 0.75rem",
                borderRadius: "0.375rem",
                border: "1px solid #d5dbd9",
                background: "#fff",
                fontSize: "0.75rem",
                cursor: "pointer",
              }}
            >
              {copied ? <Check size={13} color="#0f7a52" /> : <Copy size={13} />}
              {copied ? "Tersalin" : "Salin detail"}
            </button>
          </details>
        </main>
      </body>
    </html>
  );
}
