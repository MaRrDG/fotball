"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { BRACKET_ROUNDS, type BracketRound, type Team } from "@/lib/types";
import { LockIcon } from "@/components/icons";

interface Props {
  userId: string;
  teams: Team[];
  groupPicksLock: string | null;
  bracketOpen: string | null;
  bracketLock: string | null;
  initialGroupPicks: Record<string, string>;
  initialBracketPicks: { round: string; team: string }[];
}

function fmt(ts: string | null) {
  return ts
    ? new Date(ts).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;
}

export function TournamentForm({
  userId,
  teams,
  groupPicksLock,
  bracketOpen,
  bracketLock,
  initialGroupPicks,
  initialBracketPicks,
}: Props) {
  const [now] = useState(() => Date.now());
  const groupsOpen = !groupPicksLock || now < new Date(groupPicksLock).getTime();
  const bracketIsOpen =
    !!bracketOpen &&
    now >= new Date(bracketOpen).getTime() &&
    (!bracketLock || now < new Date(bracketLock).getTime());

  const groups = useMemo(() => {
    const map = new Map<string, Team[]>();
    for (const t of teams) {
      if (!map.has(t.group_name)) map.set(t.group_name, []);
      map.get(t.group_name)!.push(t);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [teams]);

  const [groupPicks, setGroupPicks] = useState<Record<string, string>>(initialGroupPicks);
  const [bracketPicks, setBracketPicks] = useState<Record<BracketRound, Set<string>>>(() => {
    const init = { R16: new Set<string>(), QF: new Set<string>(), SF: new Set<string>(), F: new Set<string>(), CHAMP: new Set<string>() };
    for (const p of initialBracketPicks) init[p.round as BracketRound]?.add(p.team);
    return init;
  });
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function saveGroupPicks() {
    setSaving(true);
    setMessage(null);
    const supabase = createClient();
    const rows = Object.entries(groupPicks)
      .filter(([, team]) => team)
      .map(([group_name, team]) => ({ user_id: userId, group_name, team }));
    const { error } = await supabase
      .from("group_winner_picks")
      .upsert(rows, { onConflict: "user_id,group_name" });
    setMessage(
      error
        ? error.code === "42501"
          ? "Locked — group picks closed 2h before the opening match."
          : error.message
        : "Group picks saved ✓"
    );
    setSaving(false);
  }

  async function saveBracket() {
    setSaving(true);
    setMessage(null);
    const supabase = createClient();
    // Replace all own bracket rows with the current selection.
    const { error: delError } = await supabase.from("bracket_picks").delete().eq("user_id", userId);
    if (delError) {
      setMessage(delError.code === "42501" ? "Bracket picks are locked." : delError.message);
      setSaving(false);
      return;
    }
    const rows = BRACKET_ROUNDS.flatMap(({ round }) =>
      [...bracketPicks[round]].map((team) => ({ user_id: userId, round, team }))
    );
    if (rows.length > 0) {
      const { error } = await supabase.from("bracket_picks").insert(rows);
      if (error) {
        setMessage(error.code === "42501" ? "Bracket picks are locked." : error.message);
        setSaving(false);
        return;
      }
    }
    setMessage("Bracket saved ✓");
    setSaving(false);
  }

  function toggleBracket(round: BracketRound, team: string, slots: number) {
    setBracketPicks((prev) => {
      const next = { ...prev, [round]: new Set(prev[round]) };
      if (next[round].has(team)) next[round].delete(team);
      else if (next[round].size < slots) next[round].add(team);
      return next;
    });
    setMessage(null);
  }

  const allTeams = useMemo(() => [...teams].sort((a, b) => a.name.localeCompare(b.name)), [teams]);

  if (teams.length === 0) {
    return (
      <p className="text-muted">
        Teams aren&apos;t loaded yet — the admin needs to seed the schedule first.
      </p>
    );
  }

  return (
    <div className="rise mx-auto max-w-3xl">
      <p className="tag mb-1">The long game · big points live here</p>
      <h1 className="display text-5xl leading-none">
        My <span className="text-volt">Picks</span>
      </h1>
      <p className="mt-2 mb-10 text-sm text-muted">
        Group winners (10 pts each) and the knockout bracket
        (R16: 5 · QF: 10 · SF: 20 · Final: 30 · Champion: 50).
      </p>

      {/* ---- Group winners ---- */}
      <section className="mb-12">
        <div className="mb-4 flex items-center justify-between border-b border-line pb-2">
          <h2 className="display flex items-center gap-3 text-2xl">
            <span className="slant bg-volt px-2 py-0.5 text-base text-pitch">01</span>
            Group winners
          </h2>
          <span className="tag">
            {groupsOpen
              ? groupPicksLock
                ? `Locks ${fmt(groupPicksLock)}`
                : "Open (lock not set yet)"
              : (
                <>
                  <LockIcon className="mr-1 inline-block h-3 w-3 align-[-1px]" />
                  Locked
                </>
              )}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {groups.map(([group, groupTeams]) => (
            <label key={group} className="flex flex-col gap-1 text-sm">
              <span className="tag">Group {group}</span>
              <select
                value={groupPicks[group] ?? ""}
                disabled={!groupsOpen}
                onChange={(e) => {
                  setGroupPicks((prev) => ({ ...prev, [group]: e.target.value }));
                  setMessage(null);
                }}
                className="rounded border border-line bg-panel px-2 py-1.5 text-chalk focus:border-volt focus:outline-none disabled:opacity-50"
              >
                <option value="">—</option>
                {groupTeams.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        {groupsOpen && (
          <button
            onClick={saveGroupPicks}
            disabled={saving}
            className="btn-volt mt-4 px-6 py-2 text-sm"
          >
            Save group picks
          </button>
        )}
      </section>

      {/* ---- Bracket ---- */}
      <section>
        <div className="mb-4 flex items-center justify-between border-b border-line pb-2">
          <h2 className="display flex items-center gap-3 text-2xl">
            <span className="slant bg-volt px-2 py-0.5 text-base text-pitch">02</span>
            Knockout bracket
          </h2>
          <span className="tag">
            {bracketIsOpen
              ? `Open — locks ${fmt(bracketLock) ?? "TBA"}`
              : bracketOpen && now < new Date(bracketOpen).getTime()
                ? `Opens ${fmt(bracketOpen)}`
                : bracketOpen
                  ? (
                    <>
                      <LockIcon className="mr-1 inline-block h-3 w-3 align-[-1px]" />
                      Locked
                    </>
                  )
                  : "Opens after the group stage"}
          </span>
        </div>

        {!bracketIsOpen && initialBracketPicks.length === 0 ? (
          <p className="text-sm text-muted">
            The bracket opens after the last group match and locks 2 hours before the first
            Round-of-32 game.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {BRACKET_ROUNDS.map(({ round, label, slots, points }) => (
              <div key={round}>
                <h3 className="mb-1.5 text-sm font-bold uppercase tracking-wide">
                  {label}{" "}
                  <span className="tag font-normal normal-case">
                    — pick {slots} ({points} pts each) ·{" "}
                    <span className={bracketPicks[round].size === slots ? "!text-volt" : ""}>
                      {bracketPicks[round].size}/{slots}
                    </span>
                  </span>
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {allTeams.map((t) => {
                    const selected = bracketPicks[round].has(t.name);
                    return (
                      <button
                        key={t.name}
                        type="button"
                        disabled={!bracketIsOpen}
                        onClick={() => toggleBracket(round, t.name, slots)}
                        className={`rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-60 ${
                          selected
                            ? "border-volt bg-volt/15 font-semibold text-volt"
                            : "border-line bg-panel text-muted hover:border-volt/50 hover:text-chalk"
                        }`}
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {bracketIsOpen && (
              <button
                onClick={saveBracket}
                disabled={saving}
                className="btn-volt self-start px-6 py-2 text-sm"
              >
                Save bracket
              </button>
            )}
          </div>
        )}
      </section>

      {message && <p className="mt-4 text-sm font-semibold text-volt">{message}</p>}
    </div>
  );
}
