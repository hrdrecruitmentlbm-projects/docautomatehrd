"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2 } from "lucide-react";

/**
 * Login (outside the shell, so it owns its own h1 per the invariant).
 * Dialog-style card: shadow WITHOUT border (the one allowed exception to
 * border-XOR-shadow). Pending state disables the button (double-tap guard),
 * ?error= renders an inline panel with recovery copy — never a toast.
 */
function GoogleIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function LoginError() {
  const searchParams = useSearchParams();
  const code = searchParams.get("error");
  if (!code) return null;
  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-2.5 rounded-md border border-border bg-surface-2 p-3 text-sm"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden="true" />
      <div>
        <p className="font-semibold text-text-1">Masuk gagal</p>
        <p className="mt-0.5 text-text-2">
          Pastikan Anda memakai akun Google Workspace perusahaan, lalu coba lagi.
        </p>
      </div>
    </div>
  );
}

function LoginScreen() {
  const [pending, setPending] = useState(false);

  const handleSignIn = async () => {
    setPending(true);
    try {
      await signIn("google", { callbackUrl: "/dashboard" });
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-0 px-4 py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
      <div className="w-full max-w-md rounded-xl bg-surface-1 p-8 shadow-dialog">
        {/* Brand block: tile + wordmark, no dark header band */}
        <div className="mb-6 flex flex-col items-center text-center">
          <span
            className="mb-4 flex size-12 items-center justify-center rounded-lg bg-primary text-primary-foreground"
            aria-hidden="true"
          >
            <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
              <path d="M14 2v4a2 2 0 0 0 2 2h4" />
              <path d="M16 13H8" />
              <path d="M16 17H8" />
            </svg>
          </span>
          <h1 className="text-xl font-bold tracking-[-0.01em] text-text-1">DocAuto HR</h1>
          <p className="mt-1 text-sm text-text-2">Sistem Otomasi Dokumen HR</p>
        </div>

        <LoginError />

        <p className="mb-5 text-center text-sm text-text-2">
          Silakan masuk menggunakan akun Google Workspace perusahaan Anda untuk
          melanjutkan.
        </p>

        {/* Google button: white + strong boundary (>=3:1), dark text —
            never a white-on-white ghost. Pending disables + spins. */}
        <Button
          type="button"
          onClick={handleSignIn}
          disabled={pending}
          className="h-11 w-full border border-border-strong bg-surface-1 text-sm font-medium text-text-1 hover:bg-surface-2"
        >
          {pending ? (
            <Loader2 className="mr-2 size-5 animate-spin" aria-hidden="true" />
          ) : (
            <GoogleIcon />
          )}
          {pending ? "Membuka Google..." : "Masuk dengan Google"}
        </Button>

        <p className="mt-6 text-center text-xs text-text-2">
          Akses terbatas untuk akun Google Workspace perusahaan.
        </p>
      </div>
    </main>
  );
}

// useSearchParams requires a Suspense boundary for static prerendering;
// this wrapper is the default export so the boundary sits above the screen.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginScreen />
    </Suspense>
  );
}
