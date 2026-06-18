"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { type Team } from "@/lib/types";
import { formatRo } from "@/lib/datetime";
import { LockIcon } from "@/components/icons";

interface Props {
  userId: string;
  teams: Team[];
  /** group letter -> ISO kickoff of that group's first match (its lock time). */
  groupLocks: Record<string, string>;
  initialGroupPicks: Record<string, string>;
}

function fmt(ts: string | null) {
  return ts
    ? formatRo(ts, {
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
  groupLocks,
  initialGroupPicks,
}: Props) {
  const [now] = useState(() => Date.now());
  // A group is editable until its own first match kicks off; no scheduled
  // match yet (lock unknown) means still open.
  const isGroupOpen = (group: string) =>
    !groupLocks[group] || now < new Date(groupLocks[group]).getTime();
  const anyGroupOpen = useMemo(
    () => teams.some((t) => isGroupOpen(t.group_name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [teams, groupLocks, now]
  );
  const groups = useMemo(() => {
    const map = new Map<string, Team[]>();
    for (const t of teams) {
      if (!map.has(t.group_name)) map.set(t.group_name, []);
      map.get(t.group_name)!.push(t);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [teams]);
  const allGroupsLocked = useMemo(
    () => groups.every(([group]) => !isGroupOpen(group)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, groupLocks, now]
  );

  const [groupPicks, setGroupPicks] = useState<Record<string, string>>(initialGroupPicks);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [allPicks, setAllPicks] = useState<
    Array<{ group_name: string; team: string; nickname: string }>
  >([]);
  const [loadingAllPicks, setLoadingAllPicks] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchAllPicks = async () => {
      const lockedGroups = Object.entries(groupLocks)
        .filter(([_, lockTime]) => now >= new Date(lockTime).getTime())
        .map(([group]) => group);

      if (lockedGroups.length === 0) return;

      setLoadingAllPicks(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("group_winner_picks")
        .select("group_name, team, profiles!inner(nickname)")
        .in("group_name", lockedGroups);

      if (!error && data) {
        const picks = data.map((row: any) => ({
          group_name: row.group_name,
          team: row.team,
          nickname: row.profiles.nickname,
        }));
        setAllPicks(picks);
      }
      setLoadingAllPicks(false);
    };

    fetchAllPicks();
  }, [groupLocks, now]);

  async function saveGroupPicks() {
    setSaving(true);
    setMessage(null);
    const supabase = createClient();
    // Only send still-open groups. Including a locked group would trip its RLS
    // policy and fail the whole upsert, losing the open groups too.
    const rows = Object.entries(groupPicks)
      .filter(([group_name, team]) => team && isGroupOpen(group_name))
      .map(([group_name, team]) => ({ user_id: userId, group_name, team }));
    if (rows.length === 0) {
      setMessage("Nothing to save — those groups have already kicked off.");
      setSaving(false);
      return;
    }
    const { error } = await supabase
      .from("group_winner_picks")
      .upsert(rows, { onConflict: "user_id,group_name" });
    setMessage(
      error
        ? error.code === "42501"
          ? "Locked — a group closes when its first match kicks off."
          : error.message
        : "Group picks saved ✓"
    );
    setSaving(false);
  }

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
        Call the winner of each group (3 pts each). The knockout bracket fills in
        automatically — watch it live on the{" "}
        <a href="/bracket" className="text-volt hover:underline">bracket</a> page.
      </p>

      {/* ---- Group winners ---- */}
      <section className="mb-12">
        <div className="mb-4 flex items-center justify-between border-b border-line pb-2">
          <h2 className="display flex items-center gap-3 text-2xl">
            <span className="slant bg-volt px-2 py-0.5 text-base text-pitch">01</span>
            Group winners
          </h2>
          <span className="tag">Each group locks at its first kick-off</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {groups.map(([group, groupTeams]) => {
            const groupOpen = isGroupOpen(group);
            const lock = groupLocks[group] ?? null;
            return (
              <label key={group} className="flex flex-col gap-1 text-sm">
                <span className="tag flex items-center justify-between">
                  <span>Group {group}</span>
                  <span className={groupOpen ? "!text-muted" : "!text-danger"}>
                    {groupOpen ? (
                      lock ? `Locks ${fmt(lock)}` : "Open"
                    ) : (
                      <>
                        <LockIcon className="mr-1 inline-block h-3 w-3 align-[-1px]" />
                        Locked
                      </>
                    )}
                  </span>
                </span>
                <select
                  value={groupPicks[group] ?? ""}
                  disabled={!groupOpen}
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
            );
          })}
        </div>
        {anyGroupOpen && (
          <button
            onClick={saveGroupPicks}
            disabled={saving}
            className="btn-volt mt-4 px-6 py-2 text-sm"
          >
            Save group picks
          </button>
        )}
      </section>

      {message && <p className="mt-4 text-sm font-semibold text-volt">{message}</p>}

      {allGroupsLocked && allPicks.length > 0 && (
        <section className="mt-12 border-t border-line pt-12">
          <div className="mb-6 flex items-center justify-between border-b border-line pb-2">
            <h2 className="display flex items-center gap-3 text-2xl">
              <span className="slant bg-volt px-2 py-0.5 text-base text-pitch">02</span>
              Everyone&apos;s picks
            </h2>
            <span className="tag">Once locked, picks are public</span>
          </div>
          <div className="space-y-2">
            {groups
              .filter(([group]) => allPicks.some((p) => p.group_name === group))
              .map(([group, _]) => {
                const groupPicksData = allPicks.filter((p) => p.group_name === group);
                const isExpanded = expandedGroups.has(group);

                return (
                  <div key={group} className="border border-line rounded">
                    <button
                      onClick={() => {
                        const newExpanded = new Set(expandedGroups);
                        if (newExpanded.has(group)) {
                          newExpanded.delete(group);
                        } else {
                          newExpanded.add(group);
                        }
                        setExpandedGroups(newExpanded);
                      }}
                      className="w-full flex items-center justify-between bg-panel px-4 py-3 hover:bg-panel/80 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-muted">Group {group}</span>
                        <span className="text-xs text-muted/60">
                          {groupPicksData.length} {groupPicksData.length === 1 ? "pick" : "picks"}
                        </span>
                      </div>
                      <span
                        className={`text-volt transition-transform ${
                          isExpanded ? "rotate-180" : ""
                        }`}
                      >
                        ▼
                      </span>
                    </button>
                    {isExpanded && (
                      <div className="border-t border-line divide-y divide-line bg-pitch/50">
                        {groupPicksData
                          .sort((a, b) => a.nickname.localeCompare(b.nickname))
                          .map((pick) => (
                            <div
                              key={`${pick.group_name}-${pick.nickname}`}
                              className="flex items-center justify-between px-4 py-3 text-sm"
                            >
                              <span className="text-chalk">{pick.nickname}</span>
                              <span className="font-semibold text-volt">{pick.team}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </section>
      )}
    </div>
  );
}
