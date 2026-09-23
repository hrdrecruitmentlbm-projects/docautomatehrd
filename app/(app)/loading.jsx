/**
 * Route-level loading skeleton. Mirrors the Phase 1 dashboard shape
 * (KPI band -> table -> rail) at matching heights to avoid layout shift.
 * Static pulse, not a spinner (product register: skeleton > spinner).
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="space-y-6 animate-pulse motion-reduce:animate-none"
    >
      <span className="sr-only">Memuat halaman...</span>

      {/* KPI band skeleton — one bordered strip, 4 cells with hairline dividers */}
      <div className="grid grid-cols-2 rounded-lg border border-border bg-surface-1 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="border-border p-5 even:border-l nth-3:border-t nth-4:border-t nth-3:border-l nth-4:border-l md:nth-3:border-t-0 md:nth-4:border-t-0 md:nth-2:border-l-0 md:nth-3:border-l"
          >
            <div className="skeleton mb-3 h-3 w-24 rounded motion-reduce:animate-none" />
            <div className="skeleton h-6 w-16 rounded motion-reduce:animate-none" />
          </div>
        ))}
      </div>

      {/* Main table + rail skeleton */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="rounded-lg border border-border bg-surface-1 p-5">
          <div className="skeleton mb-5 h-4 w-40 rounded motion-reduce:animate-none" />
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

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-surface-1 p-5">
            <div className="skeleton mb-4 h-4 w-32 rounded motion-reduce:animate-none" />
            <div className="mx-auto size-40 rounded-full motion-reduce:animate-none skeleton" />
            <div className="mt-5 space-y-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="skeleton h-3.5 w-20 rounded motion-reduce:animate-none" />
                  <div className="skeleton h-3.5 w-10 rounded motion-reduce:animate-none" />
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-surface-1 p-5">
            <div className="skeleton mb-4 h-4 w-28 rounded motion-reduce:animate-none" />
            <div className="space-y-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-3">
                  <div className="skeleton size-6 rounded-full motion-reduce:animate-none" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton h-3.5 w-2/3 rounded motion-reduce:animate-none" />
                    <div className="skeleton h-3 w-1/3 rounded motion-reduce:animate-none" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
