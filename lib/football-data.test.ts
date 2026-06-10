import { describe, it, expect } from "vitest";
import {
  fdStatus,
  fdFinalScore,
  fdStage,
  fdGroup,
  championFromFinal,
  type FdMatch,
} from "./football-data";

// Build an FdMatch with sensible defaults; override only what a test cares about.
function fd(over: Partial<FdMatch> = {}): FdMatch {
  const base: FdMatch = {
    id: 1,
    utcDate: "2026-06-11T18:00:00Z",
    status: "FINISHED",
    stage: "GROUP_STAGE",
    group: null,
    homeTeam: { id: 1, name: "Home" },
    awayTeam: { id: 2, name: "Away" },
    score: { winner: null, duration: "REGULAR", fullTime: { home: null, away: null } },
  };
  return { ...base, ...over, score: { ...base.score, ...(over.score ?? {}) } };
}

describe("fdStatus — maps API status+duration to the codes score_match() fires on", () => {
  it("FINISHED in regular time -> FT", () => {
    expect(fdStatus(fd({ status: "FINISHED", score: { duration: "REGULAR" } as FdMatch["score"] }))).toBe("FT");
  });
  it("FINISHED after extra time -> AET", () => {
    expect(fdStatus(fd({ status: "FINISHED", score: { duration: "EXTRA_TIME" } as FdMatch["score"] }))).toBe("AET");
  });
  it("FINISHED on penalties -> PEN", () => {
    expect(fdStatus(fd({ status: "FINISHED", score: { duration: "PENALTY_SHOOTOUT" } as FdMatch["score"] }))).toBe("PEN");
  });
  it("AWARDED counts as a final regular result -> FT", () => {
    expect(fdStatus(fd({ status: "AWARDED", score: { duration: "REGULAR" } as FdMatch["score"] }))).toBe("FT");
  });
  it("IN_PLAY -> LIVE, PAUSED -> PAUSED", () => {
    expect(fdStatus(fd({ status: "IN_PLAY" }))).toBe("LIVE");
    expect(fdStatus(fd({ status: "PAUSED" }))).toBe("PAUSED");
  });
  it("SCHEDULED and TIMED -> NS (not started)", () => {
    expect(fdStatus(fd({ status: "SCHEDULED" }))).toBe("NS");
    expect(fdStatus(fd({ status: "TIMED" }))).toBe("NS");
  });
  it("passes through POSTPONED/SUSPENDED/CANCELLED unchanged", () => {
    expect(fdStatus(fd({ status: "POSTPONED" }))).toBe("POSTPONED");
    expect(fdStatus(fd({ status: "CANCELLED" }))).toBe("CANCELLED");
  });
});

describe("fdFinalScore — the score fed to scoring; never includes shootout goals", () => {
  it("regular time uses fullTime as-is", () => {
    expect(fdFinalScore(fd({ score: { duration: "REGULAR", fullTime: { home: 2, away: 1 } } as FdMatch["score"] })))
      .toEqual({ home: 2, away: 1 });
  });

  it("extra time = regular + extra time goals", () => {
    expect(
      fdFinalScore(
        fd({
          score: {
            duration: "EXTRA_TIME",
            fullTime: { home: 2, away: 1 },
            regularTime: { home: 1, away: 1 },
            extraTime: { home: 1, away: 0 },
          } as FdMatch["score"],
        })
      )
    ).toEqual({ home: 2, away: 1 });
  });

  it("penalty shootout uses the 120' score and IGNORES the shootout goals", () => {
    // 1-1 after extra time, home win 5-3 on pens -> scored as a 1-1 draw.
    expect(
      fdFinalScore(
        fd({
          score: {
            duration: "PENALTY_SHOOTOUT",
            fullTime: { home: 1, away: 1 },
            regularTime: { home: 1, away: 1 },
            extraTime: { home: 0, away: 0 },
            penalties: { home: 5, away: 3 },
          } as FdMatch["score"],
        })
      )
    ).toEqual({ home: 1, away: 1 });
  });

  it("falls back to fullTime when per-period data is missing", () => {
    expect(
      fdFinalScore(
        fd({ score: { duration: "EXTRA_TIME", fullTime: { home: 3, away: 2 } } as FdMatch["score"] })
      )
    ).toEqual({ home: 3, away: 2 });
  });

  it("leaves a not-yet-played match as nulls", () => {
    expect(fdFinalScore(fd({ score: { duration: "REGULAR", fullTime: { home: null, away: null } } as FdMatch["score"] })))
      .toEqual({ home: null, away: null });
  });
});

describe("fdStage — API stage -> our matches.stage codes", () => {
  it("maps every known stage", () => {
    expect(fdStage("GROUP_STAGE")).toBe("GROUP");
    expect(fdStage("LAST_32")).toBe("R32");
    expect(fdStage("LAST_16")).toBe("R16");
    expect(fdStage("QUARTER_FINALS")).toBe("QF");
    expect(fdStage("SEMI_FINALS")).toBe("SF");
    expect(fdStage("THIRD_PLACE")).toBe("3RD");
    expect(fdStage("FINAL")).toBe("F");
  });
  it("defaults unknown stages to GROUP", () => {
    expect(fdStage("SOMETHING_NEW")).toBe("GROUP");
  });
});

describe("fdGroup — 'GROUP_A' -> 'A'", () => {
  it("strips the prefix and handles null", () => {
    expect(fdGroup("GROUP_A")).toBe("A");
    expect(fdGroup("GROUP_L")).toBe("L");
    expect(fdGroup(null)).toBeNull();
  });
});

describe("championFromFinal — who the CHAMP result records", () => {
  const teams = { home_team: "Brazil", away_team: "France" };

  it("penalty final -> the shootout winner", () => {
    expect(championFromFinal({ ...teams, status: "PEN", penalty_winner: "home", home_goals: 1, away_goals: 1 })).toBe("Brazil");
    expect(championFromFinal({ ...teams, status: "PEN", penalty_winner: "away", home_goals: 1, away_goals: 1 })).toBe("France");
  });
  it("decided final -> the side with more goals", () => {
    expect(championFromFinal({ ...teams, status: "FT", penalty_winner: null, home_goals: 2, away_goals: 0 })).toBe("Brazil");
    expect(championFromFinal({ ...teams, status: "AET", penalty_winner: null, home_goals: 1, away_goals: 3 })).toBe("France");
  });
  it("returns null while a finalist is still TBD", () => {
    expect(championFromFinal({ home_team: null, away_team: "France", status: "FT", penalty_winner: null, home_goals: null, away_goals: null })).toBeNull();
  });
});
