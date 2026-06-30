"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { matchIsOpen, isFinished, matchIsLive, type Match, type Prediction, STAGE_LABELS } from "@/lib/types";
import { formatRo } from "@/lib/datetime";
import { LockIcon, TargetIcon } from "@/components/icons";
import { TeamCrest } from "@/components/team-crest";

interface Props {
  match: Match;
  prediction: Prediction | null;
  userId: string;
}

export function PredictionRow({ match, prediction, userId }: Props) {
  const open = matchIsOpen(match);
  const finished = isFinished(match.status);
  // Live is kickoff-time based, NOT API status: the free feed lags 10-20 min, so
  // a match in its 2nd minute can still report TIMED (stored as NS). matchIsLive
  // (same helper the match page uses) goes live at kickoff regardless of the lag.
  const live = matchIsLive(match);

  const [home, setHome] = useState<string>(prediction ? String(prediction.home_goals) : "");
  const [away, setAway] = useState<string>(prediction ? String(prediction.away_goals) : "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const kickoff = new Date(match.kickoff);

  async function save() {
    if (home === "" || away === "") return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const supabase = createClient();
    const { error } = await supabase.from("predictions").upsert(
      {
        user_id: userId,
        match_id: match.id,
        home_goals: Number(home),
        away_goals: Number(away),
      },
      { onConflict: "user_id,match_id" }
    );
    if (error) {
      // RLS rejection = the T-30 lock fired server-side.
      setError(error.code === "42501" ? "Locked — too close to kick-off." : error.message);
    } else {
      setSaved(true);
    }
    setSaving(false);
  }

  return (
    <div className={`panel overflow-hidden ${live ? "border-danger/40" : ""}`}>
      {/* meta strip */}
      <div className="flex items-center justify-between border-b border-line/70 bg-pitch/40 px-3 py-1.5">
        <span className="flex items-center gap-2">
          <span className="slant display bg-panel-2 px-2.5 py-0.5 text-[11px] text-volt">
            {STAGE_LABELS[match.stage]}
          </span>
          <span className="tag">
            {formatRo(kickoff, { weekday: "short", hour: "2-digit", minute: "2-digit" })}
          </span>
        </span>
        <span className="tag">
          {live && (
            <span className="!text-danger">
              <span className="live-dot">●</span> Live
            </span>
          )}
          {finished && (
            <span className="!text-chalk">FT{match.status !== "FT" && ` · ${match.status}`}</span>
          )}
          {!open && !finished && !live && (
            <span>
              <LockIcon className="mr-1 inline-block h-3 w-3 align-[-1px]" />
              Locked
            </span>
          )}
        </span>
      </div>

      {/* scoreboard row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="flex flex-1 items-center justify-end gap-2 overflow-hidden">
          <span className="display truncate text-right text-lg leading-none">
            {match.home_team ?? "TBD"}
          </span>
          <TeamCrest src={match.home_crest} className="h-5 w-5" />
        </span>

        {open ? (
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              max={20}
              value={home}
              onChange={(e) => { setHome(e.target.value); setSaved(false); }}
              className="score-input h-11 w-11"
              aria-label="Home goals"
            />
            <span className="display text-xl text-muted">:</span>
            <input
              type="number"
              min={0}
              max={20}
              value={away}
              onChange={(e) => { setAway(e.target.value); setSaved(false); }}
              className="score-input h-11 w-11"
              aria-label="Away goals"
            />
          </div>
        ) : (
          <span className="slant display min-w-24 bg-pitch px-4 py-1.5 text-center text-3xl leading-none text-chalk">
            {match.home_goals !== null ? (
              <>
                <span className="text-volt">{match.home_goals}</span>
                <span className="mx-1 text-muted">:</span>
                <span className="text-volt">{match.away_goals}</span>
              </>
            ) : (
              <span className="text-muted">v</span>
            )}
          </span>
        )}

        <span className="flex flex-1 items-center gap-2 overflow-hidden">
          <TeamCrest src={match.away_crest} className="h-5 w-5" />
          <span className="display truncate text-lg leading-none">
            {match.away_team ?? "TBD"}
          </span>
        </span>
      </div>

      {/* footer strip */}
      <div className="flex items-center justify-between border-t border-line/50 bg-pitch/30 px-3 py-2 text-xs">
        {open ? (
          <>
            <span className="flex items-center gap-3">
              <span className="text-muted">
                Locks T-30
                {error && <span className="ml-2 font-bold text-danger">{error}</span>}
                {saved && <span className="ml-2 font-bold text-volt">Saved ✓</span>}
              </span>
              <Link href={`/match/${match.id}`} prefetch={false} className="font-bold text-volt hover:underline">
                Match page →
              </Link>
            </span>
            <button
              onClick={save}
              disabled={saving || home === "" || away === ""}
              className="btn-volt px-5 py-1.5 text-sm"
            >
              {saving ? "Saving" : "Save"}
            </button>
          </>
        ) : (
          <>
            <span className="text-muted">
              {prediction
                ? `Your pick: ${prediction.home_goals}–${prediction.away_goals}`
                : "No prediction"}
              {prediction !== null && prediction.points !== null && (
                <span className={`display ml-2 text-sm ${prediction.is_bullseye ? "text-gold" : "text-volt"}`}>
                  {prediction.is_bullseye && <TargetIcon className="mr-1 inline-block h-3.5 w-3.5 align-[-2px]" />}
                  +{prediction.points}
                </span>
              )}
            </span>
            <Link href={`/match/${match.id}`} prefetch={false} className="font-bold text-volt hover:underline">
              Everyone&apos;s picks →
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
