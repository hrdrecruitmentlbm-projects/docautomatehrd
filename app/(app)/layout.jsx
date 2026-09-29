import { auth } from "@/auth";
import { AppShell } from "@/components/AppShell/AppShell";
import { getSyncStatus } from "@/lib/sync-status";

export default async function AppLayout({ children }) {
  const session = await auth();

  // Status data diambil di server sekali per navigasi, lalu diteruskan ke
  // shell. Gagal membaca TIDAK boleh menjatuhkan seluruh aplikasi — pil
  // status karena itu informatif, bukan kritis.
  let sync = null;
  try {
    sync = await getSyncStatus();
  } catch (e) {
    console.error("Sync status fetch failed:", e);
  }

  // Full-viewport shell (Phase 1): no floating window, no decorative blobs.
  // Scroll model: page-level scroll, sticky top bar, .scroll-locked on <html>.
  return (
    <AppShell user={session?.user} sync={sync}>
      {children}
    </AppShell>
  );
}
