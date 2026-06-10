// Sync engine — keeps the local DB in step with football-data.org.
// The free tier allows 10 requests/minute, so the budget is comfortable, but
// we still gate calls so the cron can run every 10 minutes for free:
//   * seedSchedule(): 1 request, run once (or to re-pull the full schedule).
//   * pollSync(): called every 10 minutes by a cron, but only spends an API
//     request when (a) today's matches haven't been fetched yet, or (b) a
//     match is currently in its live window.
import { createAdminClient } from "@/lib/supabase/admin";
import {
  FdMatch,
  fetchAllMatches,
  fetchMatchesByDate,
  fetchStandings,
  fdStage,
  fdStatus,
  fdGroup,
  fdFinalScore,
} from "@/lib/football-data";
import { isFinished } from "@/lib/types";

type Admin = ReturnType<typeof createAdminClient>;

function matchToRow(m: FdMatch) {
  const status = fdStatus(m);
  const finished = isFinished(status);
  const { home, away } = fdFinalScore(m);

  let penaltyWinner: "home" | "away" | null = null;
  if (status === "PEN" && (m.score.winner === "HOME_TEAM" || m.score.winner === "AWAY_TEAM")) {
    penaltyWinner = m.score.winner === "HOME_TEAM" ? "home" : "away";
  }

  return {
    id: m.id,
    kickoff: m.utcDate,
    stage: fdStage(m.stage),
    round_label: m.group ?? m.stage,
    home_team: m.homeTeam.name,
    away_team: m.awayTeam.name,
    home_goals: home,
    away_goals: away,
    status,
    penalty_winner: penaltyWinner,
    // a finished match must be (re)scored
    ...(finished ? {} : { scored: false }),
  };
}

async function upsertMatches(db: Admin, matches: FdMatch[]) {
  if (matches.length === 0) return;
  const { error } = await db.from("matches").upsert(matches.map(matchToRow));
  if (error) throw new Error(`upsert matches: ${error.message}`);
}

/** Team → group mapping, derived from group-stage fixtures (0 extra requests). */
async function upsertTeams(db: Admin, matches: FdMatch[]): Promise<number> {
  const teams = new Map<string, string>();
  for (const m of matches) {
    const group = fdGroup(m.group);
    if (!group) continue;
    if (m.homeTeam.name) teams.set(m.homeTeam.name, group);
    if (m.awayTeam.name) teams.set(m.awayTeam.name, group);
  }
  if (teams.size === 0) return 0;
  const rows = [...teams.entries()].map(([name, group_name]) => ({ name, group_name }));
  const { error } = await db.from("teams").upsert(rows);
  if (error) throw new Error(`upsert teams: ${error.message}`);
  return rows.length;
}

async function getSetting(db: Admin, key: string): Promise<string | null> {
  const { data } = await db.from("settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}

async function setSetting(db: Admin, key: string, value: string) {
  const { error } = await db.from("settings").upsert({ key, value });
  if (error) throw new Error(`set setting ${key}: ${error.message}`);
}

/** Score every finished-but-unscored match via the SQL scoring engine. */
async function scorePendingMatches(db: Admin): Promise<number> {
  const { data: pending, error } = await db
    .from("matches")
    .select("id")
    .in("status", ["FT", "AET", "PEN"])
    .eq("scored", false);
  if (error) throw new Error(`load pending: ${error.message}`);

  for (const m of pending ?? []) {
    const { error: rpcError } = await db.rpc("score_match", { p_match_id: m.id });
    if (rpcError) throw new Error(`score_match(${m.id}): ${rpcError.message}`);
  }
  return pending?.length ?? 0;
}

/**
 * Derive tournament_results from the local matches table (0 API requests):
 * any named team appearing in an R16/QF/SF/F fixture has reached that round;
 * the winner of a finished Final is the champion.
 */
async function updateTournamentResults(db: Admin) {
  const { data: koMatches, error } = await db
    .from("matches")
    .select("stage, status, home_team, away_team, home_goals, away_goals, penalty_winner")
    .in("stage", ["R16", "QF", "SF", "F"]);
  if (error) throw new Error(`load knockout: ${error.message}`);

  const rows: { kind: string; team: string }[] = [];
  for (const m of koMatches ?? []) {
    for (const team of [m.home_team, m.away_team]) {
      if (team) rows.push({ kind: m.stage, team });
    }
    if (m.stage === "F" && isFinished(m.status) && m.home_team && m.away_team) {
      const champion =
        m.status === "PEN"
          ? m.penalty_winner === "home" ? m.home_team : m.away_team
          : (m.home_goals ?? 0) > (m.away_goals ?? 0) ? m.home_team : m.away_team;
      rows.push({ kind: "CHAMP", team: champion });
    }
  }
  if (rows.length > 0) {
    const { error: upError } = await db
      .from("tournament_results")
      .upsert(rows, { onConflict: "kind,team", ignoreDuplicates: true });
    if (upError) throw new Error(`upsert results: ${upError.message}`);
  }
}

/**
 * Once the knockout draw is known (any R32 fixture has named teams), spend 1
 * request on standings to record the official group winners. Runs exactly once.
 */
async function maybeFillGroupWinners(db: Admin): Promise<boolean> {
  if ((await getSetting(db, "group_winners_filled")) === "true") return false;

  const { count } = await db
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("stage", "R32")
    .not("home_team", "is", null);
  if (!count) return false;

  const standings = await fetchStandings();
  const rows: { kind: string; team: string; group_name: string }[] = [];
  for (const group of standings) {
    if (group.type !== "TOTAL" || !group.group) continue;
    const winner = group.table.find((t) => t.position === 1);
    if (winner) {
      rows.push({
        kind: "GROUP_WINNER",
        team: winner.team.name,
        group_name: fdGroup(group.group)!,
      });
    }
  }
  if (rows.length > 0) {
    const { error } = await db
      .from("tournament_results")
      .upsert(rows, { onConflict: "kind,team", ignoreDuplicates: true });
    if (error) throw new Error(`upsert group winners: ${error.message}`);
    await setSetting(db, "group_winners_filled", "true");
  }
  return rows.length > 0;
}

/**
 * One-off seeding: pull the full schedule (1 request). Teams + groups are
 * derived from the group-stage fixtures themselves.
 */
export async function seedSchedule() {
  const db = createAdminClient();

  const matches = await fetchAllMatches();
  await upsertMatches(db, matches);
  const teamsSeeded = await upsertTeams(db, matches);

  await scorePendingMatches(db);
  await updateTournamentResults(db);

  return { fixtures: matches.length, teams: teamsSeeded };
}

/**
 * The 10-minute cron tick. Spends at most one matches request per tick, and
 * only when there is something to learn.
 */
export async function pollSync() {
  const db = createAdminClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  // Matches kicking off today (UTC), from the local cache.
  const { data: todays, error } = await db
    .from("matches")
    .select("id, kickoff, status")
    .gte("kickoff", `${today}T00:00:00Z`)
    .lt("kickoff", `${today}T23:59:59Z`);
  if (error) throw new Error(`load today: ${error.message}`);

  const lastFetch = await getSetting(db, "last_fetch_date");
  const needsDailyFetch = lastFetch !== today;

  // "Live window": from 10 min before kick-off until the API reports a final
  // status (a match practically never exceeds ~3.5h with ET + pens).
  const liveWindow = (todays ?? []).some((m) => {
    if (isFinished(m.status)) return false;
    const ko = new Date(m.kickoff).getTime();
    return now.getTime() >= ko - 10 * 60_000 && now.getTime() <= ko + 3.5 * 3_600_000;
  });

  let fetched = false;
  if ((todays ?? []).length > 0 && (needsDailyFetch || liveWindow)) {
    const matches = await fetchMatchesByDate(today);
    await upsertMatches(db, matches);
    await upsertTeams(db, matches);
    await setSetting(db, "last_fetch_date", today);
    fetched = true;
  } else if (needsDailyFetch) {
    // No matches today — mark the day done without spending a request.
    await setSetting(db, "last_fetch_date", today);
  }

  const scoredCount = await scorePendingMatches(db);
  await updateTournamentResults(db);
  const groupWinnersFilled = await maybeFillGroupWinners(db);

  return { fetched, liveWindow, scored: scoredCount, groupWinnersFilled };
}
