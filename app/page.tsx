import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PredictionRow } from "@/components/prediction-row";
import { LiveHero } from "@/components/live-hero";
import { formatRo } from "@/lib/datetime";
import { isFinished, matchIsLive, type Match, type Prediction } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const showResults = view === "results";

  const userId = await getUserId();
  if (!userId) redirect("/login");

  const supabase = await createClient();
  const nowIso = new Date().toISOString();
  // Results view: finished/past matches, newest first. Default: everything
  // still to play (including matches currently in progress).
  const cutoff = new Date(new Date(nowIso).getTime() - 4 * 3_600_000).toISOString();
  const matchQuery = supabase.from("matches").select("*");
  const [{ data: matches }, { data: predictions }] = await Promise.all([
    showResults
      ? matchQuery.lt("kickoff", nowIso).order("kickoff", { ascending: false }).limit(60)
      : matchQuery.gte("kickoff", cutoff).order("kickoff", { ascending: true }).limit(60),
    supabase.from("predictions").select("*").eq("user_id", userId),
  ]);

  const predByMatch = new Map<number, Prediction>(
    (predictions ?? []).map((p: Prediction) => [p.match_id, p])
  );

  // Matches currently being played get pulled out of the day list and shown
  // in the live hero instead.
  const nowMs = new Date(nowIso).getTime();
  const liveMatches = showResults ? [] : ((matches ?? []) as Match[]).filter(matchIsLive);
  // Dev-only preview: fake live card so the design is visible without a
  // real match in progress. Never runs in production.
  if (process.env.NODE_ENV === "development" && !showResults && liveMatches.length === 0) {
    liveMatches.push({
      id: -1,
      kickoff: new Date(nowMs - 37 * 60_000).toISOString(),
      stage: "GROUP",
      round_label: "A",
      home_team: "Romania",
      away_team: "Brazil",
      home_goals: 2,
      away_goals: 1,
      status: "LIVE",
      penalty_winner: null,
      scored: false,
    });
  }

  const liveIds = new Set(liveMatches.map((m) => m.id));
  const livePreds: Record<number, Prediction> = {};
  for (const m of liveMatches) {
    const p = predByMatch.get(m.id);
    if (p) livePreds[m.id] = p;
  }

  // Group by calendar day for display.
  const byDay = new Map<string, Match[]>();
  for (const m of (matches ?? []) as Match[]) {
    if (liveIds.has(m.id)) continue;
    // Upcoming view: a finished match belongs to the Results tab only.
    if (!showResults && isFinished(m.status)) continue;
    const day = formatRo(m.kickoff, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(m);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rise mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="tag mb-1">FIFA World Cup 2026 · Office League</p>
          <h1 className="display text-5xl leading-none">
            Match<span className="text-volt">day</span>
          </h1>
        </div>
        <div className="flex">
          <Link
            href="/"
            className={`slant-l display px-4 py-1.5 text-sm ${!showResults ? "bg-volt text-pitch" : "border border-line text-muted hover:text-chalk"}`}
          >
            Upcoming
          </Link>
          <Link
            href="/?view=results"
            className={`slant-r display px-4 py-1.5 text-sm ${showResults ? "bg-volt text-pitch" : "border border-line text-muted hover:text-chalk"}`}
          >
            Results
          </Link>
        </div>
      </div>

      {liveMatches.length > 0 && (
        <LiveHero matches={liveMatches} predictions={livePreds} />
      )}

      {byDay.size === 0 && liveMatches.length === 0 && (
        <div className="panel rise p-8 text-center">
          <p className="display text-xl text-chalk">No matches yet</p>
          <p className="mt-1 text-sm text-muted">
            The admin needs to seed the schedule from the Admin page.
          </p>
        </div>
      )}

      {[...byDay.entries()].map(([day, dayMatches], i) => (
        <section
          key={day}
          className="rise mb-10"
          style={{ "--d": `${Math.min(i, 6) * 0.07}s` } as React.CSSProperties}
        >
          <h2 className="mb-3 flex items-center gap-3">
            <span className="slant display bg-panel-2 px-3 py-1 text-sm text-chalk">{day}</span>
            <span className="h-px flex-1 bg-line" />
            <span className="tag">{dayMatches.length} match{dayMatches.length > 1 ? "es" : ""}</span>
          </h2>
          <div className="flex flex-col gap-3">
            {dayMatches.map((m) => (
              <PredictionRow
                key={m.id}
                match={m}
                prediction={predByMatch.get(m.id) ?? null}
                userId={userId}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
