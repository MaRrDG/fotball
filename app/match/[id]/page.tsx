import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { matchIsOpen, isFinished, matchIsLive, STAGE_LABELS, type Match } from "@/lib/types";
import { formatRo } from "@/lib/datetime";
import { EyeOffIcon, TargetIcon } from "@/components/icons";
import { LiveRefresh } from "@/components/live-refresh";
import { TeamCrest } from "@/components/team-crest";

export const dynamic = "force-dynamic";

type PredictionWithProfile = {
  user_id: string;
  home_goals: number;
  away_goals: number;
  penalty_winner: "home" | "away" | null;
  points: number | null;
  is_bullseye: boolean;
  profiles: { nickname: string } | null;
};

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await getUserId();
  if (!userId) redirect("/login");

  const supabase = await createClient();
  // Neither query needs the user id, so fetch the match and predictions together.
  // RLS does the heavy lifting on predictions: while the match is open this only
  // returns the caller's own prediction; after T-30 it returns everyone's.
  const [{ data: match }, { data: predictions }] = await Promise.all([
    supabase.from("matches").select("*").eq("id", Number(id)).single<Match>(),
    supabase
      .from("predictions")
      .select("user_id, home_goals, away_goals, penalty_winner, points, is_bullseye, profiles(nickname)")
      .eq("match_id", Number(id))
      .returns<PredictionWithProfile[]>(),
  ]);
  if (!match) notFound();

  const open = matchIsOpen(match);
  const finished = isFinished(match.status);
  const live = matchIsLive(match);

  const sorted = [...(predictions ?? [])].sort(
    (a, b) => (b.points ?? -1) - (a.points ?? -1)
  );

  return (
    <div className="mx-auto max-w-2xl">
      {live && <LiveRefresh />}
      <Link href="/" className="tag transition-colors hover:!text-volt">
        ← All matches
      </Link>

      {/* broadcast scoreboard hero */}
      <div className="rise my-6 overflow-hidden">
        <div className="flex items-center justify-between bg-volt px-4 py-1.5">
          <span className="display text-sm text-pitch">{STAGE_LABELS[match.stage]}</span>
          <span className="display text-sm text-pitch">
            {formatRo(match.kickoff, {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
        <div className="panel rounded-t-none border-t-0 p-6">
          <div className="flex items-center justify-center gap-5">
            <span className="flex flex-1 items-center justify-end gap-3">
              <span className="display text-right text-3xl leading-tight">
                {match.home_team ?? "TBD"}
              </span>
              <TeamCrest src={match.home_crest} className="h-9 w-9" />
            </span>
            <span className="slant display bg-pitch px-5 py-2 text-5xl leading-none">
              {match.home_goals !== null || live ? (
                <>
                  <span className="text-volt">{match.home_goals ?? 0}</span>
                  <span className="mx-1.5 text-muted">:</span>
                  <span className="text-volt">{match.away_goals ?? 0}</span>
                </>
              ) : (
                <span className="text-muted">VS</span>
              )}
            </span>
            <span className="flex flex-1 items-center gap-3">
              <TeamCrest src={match.away_crest} className="h-9 w-9" />
              <span className="display text-left text-3xl leading-tight">
                {match.away_team ?? "TBD"}
              </span>
            </span>
          </div>
          {match.status === "PEN" && match.penalty_winner && (
            <p className="mt-3 text-center text-sm text-muted">
              <span className="font-bold text-gold">
                {match.penalty_winner === "home" ? match.home_team : match.away_team}
              </span>{" "}
              advance on penalties
            </p>
          )}
          {live && (
            <>
              <p className="tag mt-3 text-center !text-danger">
                <span className="live-dot">●</span>{" "}
                {match.status === "NS" ? "Live" : match.status}
              </p>
              <p className="mt-1 text-center text-xs text-muted">
                Live score is delayed — the free data feed may only update it at
                half-time or full-time
              </p>
            </>
          )}
        </div>
      </div>

      <div className="rise flex items-baseline justify-between" style={{ "--d": "0.1s" } as React.CSSProperties}>
        <h2 className="display text-2xl">The Predictions</h2>
        <span className="tag">{open ? "Sealed" : `${sorted.length} in`}</span>
      </div>

      {open ? (
        <div className="panel rise mt-3 p-6 text-center" style={{ "--d": "0.15s" } as React.CSSProperties}>
          <p className="display text-lg text-chalk">
            <EyeOffIcon className="mr-2 inline-block h-5 w-5 align-[-3px] text-volt" />
            Sealed until T-30
          </p>
          <p className="mt-1 text-sm text-muted">
            Nobody copies their way up the table. Everyone&apos;s picks go public 30 minutes
            before kick-off — until then you only see your own.
          </p>
        </div>
      ) : (
        <div className="rise mt-3 flex flex-col gap-2" style={{ "--d": "0.15s" } as React.CSSProperties}>
          {sorted.length === 0 && <p className="text-sm text-muted">No predictions for this one.</p>}
          {sorted.map((p) => (
            <div
              key={p.user_id}
              className={`panel grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 py-2.5 ${
                p.user_id === userId ? "border-volt/60" : ""
              }`}
            >
              <span className="truncate text-sm font-bold">
                {p.profiles?.nickname ?? "?"}
                {p.user_id === userId && <span className="tag ml-2 !text-volt">you</span>}
              </span>
              <span className="display text-center text-xl">
                {p.home_goals}<span className="text-muted">–</span>{p.away_goals}
                {p.penalty_winner && (
                  <span className="tag ml-2">
                    pens: {p.penalty_winner === "home" ? match.home_team : match.away_team}
                  </span>
                )}
              </span>
              <span className="text-right">
                {p.points !== null ? (
                  <span className={`display text-lg ${p.is_bullseye ? "trophy-glow text-gold" : "text-volt"}`}>
                    {p.is_bullseye && <TargetIcon className="mr-1 inline-block h-4 w-4 align-[-2px]" />}
                    +{p.points}
                  </span>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
