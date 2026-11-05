/**
 * Shown instantly after a tap while the server prepares the page (Next.js `loading.tsx`), so the app never looks
 * frozen. Grey blocks roughly where the real content will be.
 */
function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-xl bg-surface-2 ${className}`} />;
}

export function PageSkeleton({ title, cards = ["h-40", "h-28", "h-56"] }: { title: string; cards?: string[] }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
      <Block className="mt-2 h-4 w-56" />
      <div className="mt-6 space-y-4">
        {cards.map((height, i) => (
          <div key={i} className="rounded-2xl border border-line bg-surface p-4">
            <Block className="mb-3 h-5 w-40" />
            <Block className={`w-full ${height}`} />
          </div>
        ))}
      </div>
      <span className="sr-only">Wird geladen …</span>
    </div>
  );
}
