import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { LeaderboardRow } from "@/lib/types";
import { CrownIcon, MedalIcon, TargetIcon, TrophyIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

function Podium({ rows, userId }: { rows: LeaderboardRow[]; userId: string }) {
  const [first, second, third] = rows;
  const spots = [
    { row: second, place: 2, h: "h-20", tone: "text-chalk", medal: "text-chalk/70" },
    { row: first, place: 1, h: "h-28", tone: "trophy-glow text-gold", medal: "text-gold" },
    { row: third, place: 3, h: "h-14", tone: "text-chalk", medal: "text-volt-dim" },
  ];
  return (
    <div className="mb-8 grid grid-cols-3 items-end gap-2">
      {spots.map(({ row, place, h, tone, medal }) => (
        <div key={place} className="flex flex-col items-center">
          {row && (
            <>
              {place === 1 ? (
                <TrophyIcon className={`h-7 w-7 ${medal}`} />
              ) : (
                <MedalIcon className={`h-6 w-6 ${medal}`} />
              )}
              <span className={`display mt-1 max-w-full truncate px-1 text-lg ${tone}`}>
                {row.nickname}
              </span>
              <span className="display text-3xl text-volt">{row.total_points}</span>
            </>
          )}
          <div
            className={`mt-2 w-full ${h} slant flex items-start justify-center border-t-2 ${
              place === 1 ? "border-gold bg-panel-2" : "border-line bg-panel"
            } ${row?.user_id === userId ? "ring-1 ring-volt" : ""}`}
          >
            <span className="display mt-2 text-2xl text-muted">{place}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function LeaderboardPage() {
  const supabase = await createClient();
  // The leaderboard query doesn't depend on the user id, so fetch both at once.
  const [userId, { data }] = await Promise.all([
    getUserId(),
    supabase.from("leaderboard").select("*").returns<LeaderboardRow[]>(),
  ]);
  if (!userId) redirect("/login");

  const rows = data ?? [];
  const anyPoints = rows.some((r) => r.total_points > 0);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rise mb-8">
        <p className="tag mb-1">Sorted by total · ties: bulls-eyes → champion → group stage</p>
        <h1 className="display text-5xl leading-none">
          The <span className="text-gold">Table</span>
        </h1>
      </div>

      {rows.length >= 3 && anyPoints && (
        <div className="rise" style={{ "--d": "0.08s" } as React.CSSProperties}>
          <Podium rows={rows} userId={userId} />
        </div>
      )}

      <div className="panel rise overflow-hidden" style={{ "--d": "0.16s" } as React.CSSProperties}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-pitch/40 text-left">
              <th className="tag px-3 py-2.5">#</th>
              <th className="tag px-3 py-2.5">Player</th>
              <th className="tag px-3 py-2.5 text-right">Matches</th>
              <th className="tag px-3 py-2.5 text-right">Tourney</th>
              <th className="tag px-3 py-2.5 text-right" title="Bulls-eyes">
                <TargetIcon className="ml-auto inline-block h-3.5 w-3.5" />
              </th>
              <th className="tag px-3 py-2.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const last = i === rows.length - 1 && rows.length > 3;
              return (
                <tr
                  key={row.user_id}
                  className={`border-t border-line/50 ${row.user_id === userId ? "bg-volt/5" : ""}`}
                >
                  <td className="display w-10 px-3 py-2.5 text-muted">
                    {i + 1}
                  </td>
                  <td className="px-3 py-2.5 font-bold">
                    {row.nickname}
                    {row.champion_guessed && (
                      <CrownIcon className="ml-1.5 inline-block h-3.5 w-3.5 text-gold" />
                    )}
                    {row.user_id === userId && <span className="tag ml-2 !text-volt">you</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right text-muted">{row.match_points}</td>
                  <td className="px-3 py-2.5 text-right text-muted">{row.tournament_points}</td>
                  <td className="px-3 py-2.5 text-right text-muted">{row.bullseyes}</td>
                  <td className="display px-3 py-2.5 text-right text-xl text-volt">
                    {row.total_points}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="p-6 text-center text-muted">No players yet.</p>}
      </div>

      <p className="mt-3 text-center text-xs text-muted">
        <Link href="/rules" className="text-volt hover:underline">
          how points work
        </Link>
      </p>
    </div>
  );
}
