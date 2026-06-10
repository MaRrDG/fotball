import Link from "next/link";
import { isFinished, type Match } from "@/lib/types";
import { TrophyIcon } from "@/components/icons";

// NCAA-style bracket: two wings of R32 → R16 → QF → SF converging on a
// center Final. Rounds are sorted chronologically and split half/half per
// wing; flex `justify-around` keeps every match vertically centred between
// the pair that feeds it. Fluid on desktop (fits the container), horizontal
// scroll on smaller screens.

const WING_ROUNDS = ["R32", "R16", "QF", "SF"] as const;
const SLOTS: Record<(typeof WING_ROUNDS)[number], number> = { R32: 16, R16: 8, QF: 4, SF: 2 };
const ROUND_LABEL: Record<(typeof WING_ROUNDS)[number], string> = {
  R32: "R32",
  R16: "R16",
  QF: "QF",
  SF: "SF",
};
const COLUMN_H = "h-[640px]";
// fixed width on mobile (scrolls), fluid share of the row on lg+
const COL_W = "w-36 lg:w-auto lg:flex-1 lg:min-w-0";

interface BracketProps {
  matches: Match[];
  /** rounds the viewer picked each team to reach, e.g. picks.R16 = Set of names */
  picks: Record<string, Set<string>>;
  champion: string | null;
}

function winnerSide(m: Match): "home" | "away" | null {
  if (!isFinished(m.status) || m.home_goals === null || m.away_goals === null) return null;
  if (m.status === "PEN") return m.penalty_winner;
  return m.home_goals > m.away_goals ? "home" : "away";
}

function TeamLine({
  name,
  goals,
  won,
  lost,
  predicted,
}: {
  name: string | null;
  goals: number | null;
  won: boolean;
  lost: boolean;
  predicted: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-1 px-1.5 py-1 ${
        lost ? "text-muted" : "text-chalk"
      }`}
    >
      <span className={`truncate text-[11px] ${won ? "font-bold text-volt" : ""}`}>
        {predicted && (
          <span
            className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-volt align-middle"
            title="You picked this team to be here"
          />
        )}
        {name ?? "—"}
      </span>
      <span className={`display text-[11px] ${won ? "text-volt" : ""}`}>{goals ?? ""}</span>
    </div>
  );
}

function MatchCard({
  match,
  picks,
  side,
}: {
  match: Match | null;
  picks: Record<string, Set<string>>;
  side: "left" | "right" | "center";
}) {
  const tick =
    side === "left"
      ? "after:absolute after:left-full after:top-1/2 after:h-px after:w-2 after:bg-line"
      : side === "right"
        ? "before:absolute before:right-full before:top-1/2 before:h-px before:w-2 before:bg-line"
        : "";

  if (!match) {
    return (
      <div className={`panel relative w-full opacity-40 ${tick}`}>
        <div className="px-1.5 py-1 text-[11px] text-muted">—</div>
        <div className="border-t border-line px-1.5 py-1 text-[11px] text-muted">—</div>
      </div>
    );
  }

  const w = winnerSide(match);
  const roundPicks = picks[match.stage];
  const live = !isFinished(match.status) && !["NS", "POSTPONED", "CANCELLED"].includes(match.status);

  return (
    <Link
      href={`/match/${match.id}`}
      className={`panel relative block w-full transition-all hover:-translate-y-0.5 hover:border-volt hover:shadow-[0_4px_24px_rgba(212,255,63,0.12)] ${tick}`}
    >
      {live && (
        <span className="live-dot absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full border-2 border-pitch bg-danger" />
      )}
      <TeamLine
        name={match.home_team}
        goals={match.home_goals}
        won={w === "home"}
        lost={w === "away"}
        predicted={!!match.home_team && !!roundPicks?.has(match.home_team)}
      />
      <div className="border-t border-line" />
      <TeamLine
        name={match.away_team}
        goals={match.away_goals}
        won={w === "away"}
        lost={w === "home"}
        predicted={!!match.away_team && !!roundPicks?.has(match.away_team)}
      />
      {match.status === "PEN" && (
        <div className="truncate border-t border-line px-1.5 py-0.5 text-[10px] text-muted">
          pens: {match.penalty_winner === "home" ? match.home_team : match.away_team}
        </div>
      )}
    </Link>
  );
}

function Wing({
  matchesByRound,
  side,
  picks,
}: {
  matchesByRound: Record<string, (Match | null)[]>;
  side: "left" | "right";
  picks: Record<string, Set<string>>;
}) {
  const rounds = side === "left" ? WING_ROUNDS : [...WING_ROUNDS].reverse();
  return (
    <>
      {rounds.map((round) => (
        <div key={`${side}-${round}`} className={COL_W}>
          <div className="tag mb-2 text-center">{ROUND_LABEL[round]}</div>
          <div className={`flex flex-col justify-around ${COLUMN_H}`}>
            {matchesByRound[round].map((m, i) => (
              <MatchCard key={m?.id ?? `${side}-${round}-${i}`} match={m} picks={picks} side={side} />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

export function Bracket({ matches, picks, champion }: BracketProps) {
  const byStage = new Map<string, Match[]>();
  for (const m of matches) {
    if (!byStage.has(m.stage)) byStage.set(m.stage, []);
    byStage.get(m.stage)!.push(m);
  }
  for (const list of byStage.values()) {
    list.sort((a, b) => a.kickoff.localeCompare(b.kickoff) || a.id - b.id);
  }

  const left: Record<string, (Match | null)[]> = {};
  const right: Record<string, (Match | null)[]> = {};
  for (const round of WING_ROUNDS) {
    const list: (Match | null)[] = [...(byStage.get(round) ?? [])];
    while (list.length < SLOTS[round]) list.push(null);
    left[round] = list.slice(0, SLOTS[round] / 2);
    right[round] = list.slice(SLOTS[round] / 2, SLOTS[round]);
  }

  const final = byStage.get("F")?.[0] ?? null;
  const third = byStage.get("3RD")?.[0] ?? null;

  return (
    <div className="overflow-x-auto pb-4 lg:overflow-visible">
      <div className="flex w-max items-start gap-2 lg:w-full">
        {/* left wing → center → right wing */}
        <Wing matchesByRound={left} side="left" picks={picks} />

        {/* center: the Final */}
        <div
          className={`mt-6 flex w-44 flex-col items-center justify-center gap-5 px-1 lg:w-auto lg:min-w-0 lg:flex-[1.35] ${COLUMN_H}`}
          style={{
            background:
              "radial-gradient(ellipse 90% 45% at 50% 42%, rgba(255,209,102,0.07), transparent 70%)",
          }}
        >
          <div className="trophy-glow display flex flex-col items-center text-center text-2xl leading-tight text-gold">
            <TrophyIcon className="mb-1 h-7 w-7" />
            The Final
          </div>
          <div className="w-full [&>a]:border-gold/50">
            <MatchCard match={final} picks={picks} side="center" />
          </div>
          <div className="w-full text-center">
            <div className="tag">Champion</div>
            <div
              className={`display mt-1 truncate text-xl ${champion ? "trophy-glow text-gold" : "text-muted"}`}
            >
              {champion ?? "?"}
            </div>
            {champion && picks.CHAMP?.has(champion) && (
              <div className="slant mx-auto mt-2 w-fit bg-volt px-3 py-1 text-xs font-bold text-pitch">
                You called it! +50
              </div>
            )}
          </div>
          {third && (
            <div className="mt-2 w-full opacity-80">
              <div className="tag mb-1 text-center">Third place</div>
              <MatchCard match={third} picks={picks} side="center" />
            </div>
          )}
        </div>

        <Wing matchesByRound={right} side="right" picks={picks} />
      </div>
    </div>
  );
}
