// Rendered instantly on navigation while the route's server component fetches.
// Without a loading boundary the App Router holds the old view until the full
// server render resolves — that's the "click a tab, nothing for 1-2s" delay.
// This covers every route that doesn't define its own loading.tsx.
export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse" aria-hidden>
      <div className="mb-8">
        <div className="mb-2 h-3 w-44 bg-panel-2" />
        <div className="h-11 w-60 bg-panel" />
      </div>
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-panel" />
        ))}
      </div>
    </div>
  );
}
