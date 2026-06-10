// Leaderboard-shaped skeleton (podium + table) shown while the view loads.
export default function LeaderboardLoading() {
  return (
    <div className="mx-auto max-w-2xl animate-pulse" aria-hidden>
      <div className="mb-8">
        <div className="mb-2 h-3 w-72 bg-panel-2" />
        <div className="h-11 w-48 bg-panel" />
      </div>

      {/* podium */}
      <div className="mb-8 grid grid-cols-3 items-end gap-2">
        <div className="h-20 bg-panel" />
        <div className="h-28 bg-panel-2" />
        <div className="h-14 bg-panel" />
      </div>

      {/* table */}
      <div className="panel overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-10 border-t border-line/50 first:border-t-0" />
        ))}
      </div>
    </div>
  );
}
