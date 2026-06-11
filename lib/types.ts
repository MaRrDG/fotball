export type Stage = "GROUP" | "R32" | "R16" | "QF" | "SF" | "3RD" | "F";
export type BracketRound = "R16" | "QF" | "SF" | "F" | "CHAMP";

export const FINISHED_STATUSES = ["FT", "AET", "PEN"] as const;

export interface Match {
  id: number;
  kickoff: string;
  stage: Stage;
  round_label: string | null;
  home_team: string | null;
  away_team: string | null;
  home_crest: string | null;
  away_crest: string | null;
  home_goals: number | null;
  away_goals: number | null;
  status: string;
  penalty_winner: "home" | "away" | null;
  scored: boolean;
  score_locked: boolean;
}

export interface Prediction {
  id: string;
  user_id: string;
  match_id: number;
  home_goals: number;
  away_goals: number;
  penalty_winner: "home" | "away" | null;
  points: number | null;
  is_bullseye: boolean;
  updated_at: string;
}

export interface Profile {
  id: string;
  nickname: string;
  is_admin: boolean;
}

export interface Team {
  name: string;
  group_name: string;
}

export interface LeaderboardRow {
  user_id: string;
  nickname: string;
  total_points: number;
  match_points: number;
  tournament_points: number;
  bullseyes: number;
  group_stage_points: number;
}

export const LOCK_MINUTES = 30;

export function matchIsOpen(match: Pick<Match, "kickoff">): boolean {
  return Date.now() < new Date(match.kickoff).getTime() - LOCK_MINUTES * 60_000;
}

export function isFinished(status: string): boolean {
  return (FINISHED_STATUSES as readonly string[]).includes(status);
}

// "Live" = kicked off within the last ~3.5h and not yet final — this also
// covers the gap before the sync cron first reports IN_PLAY.
export function matchIsLive(match: Pick<Match, "kickoff" | "status">): boolean {
  if (isFinished(match.status)) return false;
  if (["POSTPONED", "SUSPENDED", "CANCELLED"].includes(match.status)) return false;
  const ko = new Date(match.kickoff).getTime();
  const now = Date.now();
  return ko <= now && now - ko <= 3.5 * 3_600_000;
}

export const BRACKET_ROUNDS: { round: BracketRound; label: string; slots: number; points: number }[] = [
  { round: "R16", label: "Round of 16", slots: 16, points: 1 },
  { round: "QF", label: "Quarter-finals", slots: 8, points: 2 },
  { round: "SF", label: "Semi-finals", slots: 4, points: 3 },
  { round: "F", label: "Final", slots: 2, points: 5 },
  { round: "CHAMP", label: "World Champion", slots: 1, points: 8 },
];

export const STAGE_LABELS: Record<Stage, string> = {
  GROUP: "Group Stage",
  R32: "Round of 32",
  R16: "Round of 16",
  QF: "Quarter-final",
  SF: "Semi-final",
  "3RD": "Third Place",
  F: "Final",
};
