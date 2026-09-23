import { auth } from "@/auth";
import { AppShell } from "@/components/AppShell/AppShell";

export default async function AppLayout({ children }) {
  const session = await auth();

  // Full-viewport shell (Phase 1): no floating window, no decorative blobs.
  // Scroll model: page-level scroll, sticky top bar, .scroll-locked on <html>.
  return <AppShell user={session?.user}>{children}</AppShell>;
}
