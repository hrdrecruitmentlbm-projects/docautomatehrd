import { auth } from "@/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { DashboardRevamp } from "@/components/DashboardRevamp";

/**
 * Dashboard (revamped, reference-style layout).
 * Server side owns ONLY the bounded fetch + the render-time clock:
 * - RECENT_CAP keeps aggregates on a capped recent set (no unbounded select).
 * - `now` is captured here so the client component never reads the wall
 *   clock during render (React compiler purity, hydration-safe windows).
 * All filtering, KPI deltas, chart bucketing and the table live in
 * components/DashboardRevamp.jsx (client).
 */
const RECENT_CAP = 500;

/**
 * Wall clock behind a module-scope function: the React compiler purity rule
 * forbids a direct Date.now() in render, but allows module-scope helpers
 * (same pattern the previous computeTemporalStats used).
 */
function renderNow() {
  return Date.now();
}

export default async function NewDashboardPage() {
  await auth();

  const { data: logs, error: logsError } = await supabaseAdmin
    .from("document_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(RECENT_CAP);

  // Throwing here routes to error.jsx — an error must never read as empty.
  if (logsError) {
    throw new Error(`Gagal memuat dokumen: ${logsError.message}`);
  }

  return (
    <DashboardRevamp logs={logs || []} recentCap={RECENT_CAP} now={renderNow()} />
  );
}
