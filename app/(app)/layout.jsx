import { auth } from "@/auth";
import { AppShell } from "@/components/AppShell/AppShell";
import { getSyncStatus } from "@/lib/sync-status";
import { getContractNotifications } from "@/lib/pkwt-notifications";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }) {
  const session = await auth();

  // Status data dan notifikasi dihitung di server tiap halaman dimuat (TAHAP 6).
  // Gagal membaca salah satu TIDAK boleh menjatuhkan seluruh aplikasi.
  let sync = null;
  let notifications = null;

  try {
    const [syncRes, notifRes] = await Promise.all([
      getSyncStatus().catch((e) => {
        console.error("Sync status fetch failed:", e);
        return null;
      }),
      getContractNotifications({
        now: new Date(),
        userEmail: session?.user?.email,
      }).catch((e) => {
        console.error("Contract notifications fetch failed:", e);
        return null;
      }),
    ]);
    sync = syncRes;
    notifications = notifRes;
  } catch (e) {
    console.error("Layout data fetch failed:", e);
  }

  // Full-viewport shell: sticky top bar dengan lonceng notifikasi dan menu profil
  return (
    <AppShell
      user={session?.user}
      sync={sync}
      notifications={notifications}
    >
      {children}
    </AppShell>
  );
}
