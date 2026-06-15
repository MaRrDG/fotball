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
  fetchMatchesByDateRange,
  fetchStandings,
  fdStage,
  fdStatus,
  fdGroup,
  fdFinalScore,
  championFromFinal,
} from "@/lib/football-data";
import { isFinished } from "@/lib/types";

type Admin = ReturnType<typeof createAdminClient>;

function matchToRow(m: FdMatch) {
  const status = fdStatus(m);
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
    home_crest: m.homeTeam.crest,
    away_crest: m.awayTeam.crest,
    home_goals: home,
    away_goals: away,
    status,
    penalty_winner: penaltyWinner,
    // Always emit `scored` so a batched upsert has a uniform column set. A mixed
    // payload (some rows with the key, some without) makes supabase-js send NULL
    // for the missing column on inserts, which the NOT NULL `scored` constraint
    // rejects — failing the whole upsert, so a just-FINISHED match never gets
    // scored. `false` means "needs (re)scoring": scorePendingMatches picks it up,
    // and score_match is idempotent, so re-scoring a final row is a no-op.
    scored: false,
  };
}

async function upsertMatches(db: Admin, matches: FdMatch[]) {
  if (matches.length === 0) return;

  // Final results are sticky. The API flaps statuses (IN_PLAY -> TIMED ->
  // IN_PLAY within minutes), so:
  //   * rows the admin scored by hand (score_locked) are never touched;
  //   * rows already final (FT/AET/PEN) only accept another FINAL report
  //     (score corrections), never a live/scheduled one that would drag a
  //     finished match back in play and wipe its score.
  const { data: frozen, error: frozenError } = await db
    .from("matches")
    .select("id, score_locked")
    .or("score_locked.eq.true,status.in.(FT,AET,PEN)");
  if (frozenError) throw new Error(`load frozen matches: ${frozenError.message}`);
  const frozenById = new Map((frozen ?? []).map((m) => [m.id, m]));

  const rows = [];
  for (const m of matches) {
    const local = frozenById.get(m.id);
    if (local?.score_locked) continue; // admin override wins until unlocked
    if (local && !isFinished(fdStatus(m))) continue; // no final -> live flap-back
    // matchToRow emits scored:false, so a final report over an already-final row
    // is treated as a correction and rescored (score_match is idempotent).
    rows.push(matchToRow(m));
  }
  if (rows.length === 0) {
    console.log(`[sync] all ${matches.length} matches are final/locked; skipping upsert`);
    return;
  }
  const { error } = await db.from("matches").upsert(rows);
  if (error) throw new Error(`upsert matches: ${error.message}`);
  const skipped = matches.length - rows.length;
  console.log(
    `[sync] upserted ${rows.length} matches` + (skipped ? ` (skipped ${skipped} final/locked)` : "")
  );
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

  if (pending?.length) {
    console.log(
      `[sync] scoring ${pending.length} finished match(es): ${pending.map((m) => m.id).join(", ")}`
    );
  }
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
    if (m.stage === "F" && isFinished(m.status)) {
      const champion = championFromFinal(m);
      if (champion) rows.push({ kind: "CHAMP", team: champion });
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
 * Admin manual score override — used when the API lags behind the real result.
 * Locks the row against sync overwrites, then runs the same scoring engine and
 * tournament-results derivation a normal sync would.
 */
export async function setManualScore(input: {
  matchId: number;
  homeGoals: number;
  awayGoals: number;
  status: "FT" | "AET" | "PEN";
  penaltyWinner: "home" | "away" | null;
}) {
  const db = createAdminClient();

  const { data: updated, error } = await db
    .from("matches")
    .update({
      home_goals: input.homeGoals,
      away_goals: input.awayGoals,
      status: input.status,
      penalty_winner: input.status === "PEN" ? input.penaltyWinner : null,
      score_locked: true,
      scored: false,
    })
    .eq("id", input.matchId)
    .select("id");
  if (error) throw new Error(`set manual score: ${error.message}`);
  if (!updated?.length) throw new Error(`match ${input.matchId} not found`);

  console.log(
    `[sync] manual score for match ${input.matchId}: ` +
      `${input.homeGoals}-${input.awayGoals} (${input.status})`
  );
  const scoredCount = await scorePendingMatches(db);
  await updateTournamentResults(db);
  return { scored: scoredCount };
}

/**
 * Drop the manual-score lock so the next sync takes the API's version again;
 * scored is reset so the API data triggers a rescore once it arrives.
 */
export async function clearManualScore(matchId: number) {
  const db = createAdminClient();
  const { error } = await db
    .from("matches")
    .update({ score_locked: false, scored: false })
    .eq("id", matchId);
  if (error) throw new Error(`clear manual score: ${error.message}`);
  return { unlocked: matchId };
}

/**
 * The 10-minute cron tick. Spends at most one matches request per tick, and
 * only when there is something to learn.
 */
export async function pollSync() {
  const db = createAdminClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  // Matches kicking off today (UTC) — used only to decide the once-a-day fetch.
  const { data: todays, error } = await db
    .from("matches")
    .select("id")
    .gte("kickoff", `${today}T00:00:00Z`)
    .lt("kickoff", `${today}T23:59:59Z`);
  if (error) throw new Error(`load today: ${error.message}`);

  // "Live window": from 10 min before kick-off until the API reports a final
  // status. Computed off `now`, NOT the calendar day — a 22:00 UTC kick-off that
  // ends after midnight UTC stays in the window and keeps getting polled until
  // it reports final. A day-scoped query would drop it at midnight and leave it
  // stuck mid-match in the DB (the API's FINISHED never lands, needing a manual
  // fix). The look-back is deliberately generous (24h, not the ~3.5h a match
  // actually lasts): the free feed often only updates at half-time / full-time
  // and can report FINISHED long after the final whistle. A tight window would
  // let a delayed final slip out before its FINISHED was ever fetched, leaving
  // the match stuck LIVE and unscored. Postponed/suspended/cancelled fixtures
  // are excluded so they never pin the poller open burning an API call a tick.
  const liveFrom = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const liveTo = new Date(now.getTime() + 10 * 60_000).toISOString();
  const { data: liveCands, error: liveErr } = await db
    .from("matches")
    .select("id, kickoff, status")
    .gte("kickoff", liveFrom)
    .lte("kickoff", liveTo);
  if (liveErr) throw new Error(`load live window: ${liveErr.message}`);
  const DEAD_STATUSES = ["POSTPONED", "SUSPENDED", "CANCELLED"];
  const liveMatches = (liveCands ?? []).filter(
    (m) => !isFinished(m.status) && !DEAD_STATUSES.includes(m.status)
  );
  const liveWindow = liveMatches.length > 0;

  const lastFetch = await getSetting(db, "last_fetch_date");
  const needsDailyFetch = lastFetch !== today;

  console.log(
    `[sync] poll: today=${today} todaysMatches=${(todays ?? []).length} ` +
      `liveMatches=${liveMatches.length} lastFetch=${lastFetch ?? "none"} ` +
      `needsDailyFetch=${needsDailyFetch}`
  );

  let fetched = false;
  const dailyFetchDue = (todays ?? []).length > 0 && needsDailyFetch;
  if (dailyFetchDue || liveWindow) {
    // One request covers every date we need: today through tomorrow (as the
    // daily fetch always has), extended back to the date of any live match that
    // kicked off on an earlier UTC day so a cross-midnight match is re-polled.
    const tomorrow = new Date(`${today}T00:00:00Z`);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const from = [today, ...liveMatches.map((m) => m.kickoff.slice(0, 10))].sort()[0];
    const to = tomorrow.toISOString().slice(0, 10);
    const reason = needsDailyFetch ? "daily fetch" : "live window";
    console.log(`[sync] calling football-data for ${from}..${to} (${reason})`);
    const matches = await fetchMatchesByDateRange(from, to);
    await upsertMatches(db, matches);
    await upsertTeams(db, matches);
    if (needsDailyFetch) await setSetting(db, "last_fetch_date", today);
    fetched = true;
  } else if (needsDailyFetch) {
    // No matches today — mark the day done without spending a request.
    console.log(`[sync] no matches today; marking ${today} done without an API call`);
    await setSetting(db, "last_fetch_date", today);
  } else {
    console.log(`[sync] nothing to fetch this tick (liveWindow=${liveWindow})`);
  }

  const scoredCount = await scorePendingMatches(db);
  await updateTournamentResults(db);
  const groupWinnersFilled = await maybeFillGroupWinners(db);

  const result = { fetched, liveWindow, scored: scoredCount, groupWinnersFilled };
  console.log(`[sync] poll done: ${JSON.stringify(result)}`);
  return result;
}
