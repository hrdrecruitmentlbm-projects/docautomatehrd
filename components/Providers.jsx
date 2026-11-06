"use client";

import { useEffect } from "react";
import { SessionProvider, useSession, signIn } from "next-auth/react";

// Jika refresh token Google gagal, paksa login ulang otomatis.
function SessionGuard() {
  const { data: session } = useSession();
  useEffect(() => {
    if (session?.error === "RefreshAccessTokenError") {
      signIn("google", { callbackUrl: "/dashboard" });
    }
  }, [session?.error]);
  return null;
}

export function Providers({ children }) {
  return (
    <SessionProvider>
      <SessionGuard />
      {children}
    </SessionProvider>
  );
}
