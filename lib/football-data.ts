// Thin client for football-data.org v4 (https://docs.football-data.org).
// Free tier: 10 requests/minute — lib/sync.ts polls gently anyway.

const BASE = "https://api.football-data.org/v4";
export const COMPETITION = "WC"; // FIFA World Cup

export interface FdTeam {
  id: number | null;
  name: string | null;
  crest: string | null; // e.g. https://crests.football-data.org/769.svg
}

export interface FdMatch {
  id: number;
  utcDate: string;
  // SCHEDULED | TIMED | IN_PLAY | PAUSED | FINISHED | SUSPENDED | POSTPONED | CANCELLED | AWARDED
  status: string;
  // GROUP_STAGE | LAST_32 | LAST_16 | QUARTER_FINALS | SEMI_FINALS | THIRD_PLACE | FINAL
  stage: string;
  group: string | null; // "GROUP_A" .. "GROUP_L"
  homeTeam: FdTeam;
  awayTeam: FdTeam;
  score: {
    winner: "HOME_TEAM" | "AWAY_TEAM" | "DRAW" | null;
    duration: "REGULAR" | "EXTRA_TIME" | "PENALTY_SHOOTOUT";
    fullTime: { home: number | null; away: number | null };
    // Goals scored DURING each period (present for ET/shootout matches).
    regularTime?: { home: number | null; away: number | null };
    extraTime?: { home: number | null; away: number | null };
    penalties?: { home: number | null; away: number | null };
  };
}

export interface FdStandingsGroup {
  group: string | null; // "GROUP_A"
  type: string; // "TOTAL"
  table: { position: number; team: { id: number; name: string } }[];
}

async function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const qs = params ? `?${new URLSearchParams(params)}` : "";
  const res = await fetch(`${BASE}${path}${qs}`, {
    headers: { "X-Auth-Token": process.env.FOOTBALL_DATA_API_KEY! },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`football-data ${path} failed: HTTP ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

/** All World Cup matches (1 request — seeds the full schedule). */
export async function fetchAllMatches(): Promise<FdMatch[]> {
  const data = await apiGet<{ matches: FdMatch[] }>(`/competitions/${COMPETITION}/matches`);
  return data.matches;
}

/** Matches in an inclusive UTC date range, YYYY-MM-DD (1 request). */
export async function fetchMatchesByDateRange(from: string, to: string): Promise<FdMatch[]> {
  return (
    await apiGet<{ matches: FdMatch[] }>(`/competitions/${COMPETITION}/matches`, {
      dateFrom: from,
      dateTo: to,
    })
  ).matches;
}

/** Matches on a given UTC date, YYYY-MM-DD (1 request — the polling fetch). */
export async function fetchMatchesByDate(date: string): Promise<FdMatch[]> {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return fetchMatchesByDateRange(date, next.toISOString().slice(0, 10));
}

/** Group standings (1 request — official group winners after the group stage). */
export async function fetchStandings(): Promise<FdStandingsGroup[]> {
  const data = await apiGet<{ standings: FdStandingsGroup[] }>(
    `/competitions/${COMPETITION}/standings`
  );
  return data.standings;
}

/** football-data stage → our stage codes (see matches.stage check constraint). */
export function fdStage(stage: string): string {
  const map: Record<string, string> = {
    GROUP_STAGE: "GROUP",
    LAST_32: "R32",
    LAST_16: "R16",
    QUARTER_FINALS: "QF",
    SEMI_FINALS: "SF",
    THIRD_PLACE: "3RD",
    FINAL: "F",
  };
  return map[stage] ?? "GROUP";
}

/**
 * football-data status + duration → the status codes the DB scoring engine
 * expects (score_match() only fires on FT / AET / PEN).
 */
export function fdStatus(match: FdMatch): string {
  switch (match.status) {
    case "FINISHED":
    case "AWARDED": // awarded result counts as final
      if (match.score.duration === "PENALTY_SHOOTOUT") return "PEN";
      if (match.score.duration === "EXTRA_TIME") return "AET";
      return "FT";
    case "IN_PLAY":
      return "LIVE";
    case "PAUSED":
      return "PAUSED";
    case "SCHEDULED":
    case "TIMED":
      return "NS";
    default:
      return match.status; // POSTPONED, SUSPENDED, CANCELLED
  }
}

/** "GROUP_A" → "A" */
export function fdGroup(group: string | null): string | null {
  return group ? group.replace(/^GROUP_/, "") : null;
}

/**
 * Score after 90' or 120' (never includes shootout goals). For ET/shootout
 * matches v4 reports goals per period, so 120' = regularTime + extraTime;
 * for regular matches fullTime is exactly the 90' score.
 */
export function fdFinalScore(match: FdMatch): { home: number | null; away: number | null } {
  const s = match.score;
  if (s.duration !== "REGULAR" && s.regularTime?.home !== null && s.regularTime !== undefined) {
    return {
      home: (s.regularTime.home ?? 0) + (s.extraTime?.home ?? 0),
      away: (s.regularTime.away ?? 0) + (s.extraTime?.away ?? 0),
    };
  }
  return { home: s.fullTime.home, away: s.fullTime.away };
}

/**
 * Champion of a finished Final: the shootout winner if it went to penalties,
 * otherwise the side with more goals after 90'/120'. Returns null if either
 * team is still TBD. (A Final cannot end level without penalties, so the goal
 * comparison is only reached for a decided regular/ET result.)
 */
export function championFromFinal(m: {
  status: string;
  home_team: string | null;
  away_team: string | null;
  home_goals: number | null;
  away_goals: number | null;
  penalty_winner: "home" | "away" | null;
}): string | null {
  if (!m.home_team || !m.away_team) return null;
  if (m.status === "PEN") {
    return m.penalty_winner === "home" ? m.home_team : m.away_team;
  }
  return (m.home_goals ?? 0) > (m.away_goals ?? 0) ? m.home_team : m.away_team;
}
