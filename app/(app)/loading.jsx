/**
 * Generic route skeleton (shared by every (app) route now that all titles
 * live in the shell). Neutral shape: title bar -> filter pills -> content
 * rows. Route-specific skeletons are a stretch goal; this must never
 * mimic one particular page's layout (a dashboard-shaped flash on /settings
 * reads as a bug).
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="space-y-4 animate-pulse motion-reduce:animate-none"
    >
      <span className="sr-only">Memuat halaman...</span>

      {/* Section header */}
      <div className="flex items-center justify-between px-1 py-1">
        <div className="skeleton h-5 w-32 rounded motion-reduce:animate-none" />
        <div className="flex gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="skeleton h-8 w-20 rounded-full motion-reduce:animate-none"
            />
          ))}
        </div>
      </div>

      {/* Folder-strip shaped band */}
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex min-h-[76px] items-center gap-3 bg-surface-1 p-4">
            <div className="skeleton size-8 rounded-md motion-reduce:animate-none" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-3.5 w-16 rounded motion-reduce:animate-none" />
              <div className="skeleton h-3 w-24 rounded motion-reduce:animate-none" />
            </div>
          </div>
        ))}
      </div>

      {/* Table rows at final row height */}
      <div className="rounded-lg border border-border bg-surface-1 p-5">
        <div className="space-y-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="skeleton size-7 rounded-md motion-reduce:animate-none" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-3.5 w-1/3 rounded motion-reduce:animate-none" />
              </div>
              <div className="skeleton h-3.5 w-16 rounded motion-reduce:animate-none" />
              <div className="skeleton h-3.5 w-20 rounded motion-reduce:animate-none" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
