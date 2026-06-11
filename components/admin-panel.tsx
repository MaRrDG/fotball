"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface OverrideMatch {
  id: number;
  kickoff: string;
  stage: string;
  home_team: string | null;
  away_team: string | null;
  home_goals: number | null;
  away_goals: number | null;
  status: string;
  penalty_winner: "home" | "away" | null;
  score_locked: boolean;
}

interface Props {
  matchCount: number;
  userCount: number;
  recentMatches: OverrideMatch[];
}

async function callAdmin(payload: Record<string, unknown>) {
  const res = await fetch("/api/admin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json;
}

export function AdminPanel({ matchCount, userCount, recentMatches }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");

  const [overrideId, setOverrideId] = useState("");
  const [homeGoals, setHomeGoals] = useState("");
  const [awayGoals, setAwayGoals] = useState("");
  const [overrideStatus, setOverrideStatus] = useState<"FT" | "AET" | "PEN">("FT");
  const [penaltyWinner, setPenaltyWinner] = useState<"home" | "away" | "">("");

  const selectedMatch = recentMatches.find((m) => String(m.id) === overrideId);

  function selectOverrideMatch(id: string) {
    setOverrideId(id);
    const m = recentMatches.find((x) => String(x.id) === id);
    setHomeGoals(m?.home_goals != null ? String(m.home_goals) : "");
    setAwayGoals(m?.away_goals != null ? String(m.away_goals) : "");
    setOverrideStatus(m?.status === "AET" || m?.status === "PEN" ? m.status : "FT");
    setPenaltyWinner(m?.penalty_winner ?? "");
  }

  const overrideReady =
    selectedMatch !== undefined &&
    /^\d{1,2}$/.test(homeGoals) &&
    /^\d{1,2}$/.test(awayGoals) &&
    (overrideStatus !== "PEN" || penaltyWinner !== "");

  async function run(name: string, payload: Record<string, unknown>, onOk?: () => void) {
    setBusy(name);
    setLog(null);
    try {
      const result = await callAdmin(payload);
      setLog(`${name}: ${JSON.stringify(result)}`);
      onOk?.();
      router.refresh();
    } catch (e) {
      setLog(`${name} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    setBusy(null);
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="display text-3xl">Admin</h1>
        <p className="text-sm text-muted">
          {matchCount} matches in DB · {userCount} players
        </p>
      </div>

      {/* Schedule sync */}
      <section className="panel p-4">
        <h2 className="mb-2 font-semibold">Schedule & scores</h2>
        <p className="mb-3 text-sm text-muted">
          Seed pulls the full fixture list + team groups from football-data.org (1 request).
          Sync is the same job the cron runs every 10 minutes.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => run("Seed", { action: "seed" })}
            disabled={busy !== null}
            className="display rounded bg-volt px-4 py-1.5 text-sm text-pitch hover:bg-volt-dim disabled:opacity-30"
          >
            {busy === "Seed" ? "Seeding..." : "Seed full schedule"}
          </button>
          <button
            onClick={() => run("Sync", { action: "sync" })}
            disabled={busy !== null}
            className="rounded border border-line bg-panel px-4 py-1.5 text-sm font-semibold text-chalk hover:border-volt disabled:opacity-30"
          >
            {busy === "Sync" ? "Syncing..." : "Sync now"}
          </button>
        </div>
      </section>

      {/* Manual score override */}
      <section className="panel p-4">
        <h2 className="mb-2 font-semibold">Manual score override</h2>
        <p className="mb-3 text-sm text-muted">
          When football-data.org lags behind the real result, enter the final score here.
          The match is scored immediately and locked so the sync job can&apos;t overwrite it.
          Unlock once the API has caught up to hand control back to the sync.
        </p>
        <div className="flex flex-col gap-2">
          <select
            value={overrideId}
            onChange={(e) => selectOverrideMatch(e.target.value)}
            className="max-w-md rounded border border-line bg-panel px-2 py-1.5 text-sm text-chalk focus:border-volt focus:outline-none"
          >
            <option value="">Select a match…</option>
            {recentMatches.map((m) => (
              <option key={m.id} value={m.id}>
                {new Date(m.kickoff).toLocaleString()} — {m.home_team ?? "TBD"} vs{" "}
                {m.away_team ?? "TBD"} ({m.status}
                {m.home_goals != null ? ` ${m.home_goals}-${m.away_goals}` : ""})
                {m.score_locked ? " 🔒" : ""}
              </option>
            ))}
          </select>

          {selectedMatch && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={99}
                  placeholder={selectedMatch.home_team ?? "Home"}
                  value={homeGoals}
                  onChange={(e) => setHomeGoals(e.target.value)}
                  className="w-24 rounded border border-line bg-panel px-2 py-1.5 text-sm text-chalk placeholder:text-muted focus:border-volt focus:outline-none"
                />
                <span className="text-muted">–</span>
                <input
                  type="number"
                  min={0}
                  max={99}
                  placeholder={selectedMatch.away_team ?? "Away"}
                  value={awayGoals}
                  onChange={(e) => setAwayGoals(e.target.value)}
                  className="w-24 rounded border border-line bg-panel px-2 py-1.5 text-sm text-chalk placeholder:text-muted focus:border-volt focus:outline-none"
                />
                <select
                  value={overrideStatus}
                  onChange={(e) => setOverrideStatus(e.target.value as "FT" | "AET" | "PEN")}
                  className="rounded border border-line bg-panel px-2 py-1.5 text-sm text-chalk focus:border-volt focus:outline-none"
                >
                  <option value="FT">Full time (90&apos;)</option>
                  <option value="AET">After extra time</option>
                  <option value="PEN">Penalty shootout</option>
                </select>
                {overrideStatus === "PEN" && (
                  <select
                    value={penaltyWinner}
                    onChange={(e) => setPenaltyWinner(e.target.value as "home" | "away" | "")}
                    className="rounded border border-line bg-panel px-2 py-1.5 text-sm text-chalk focus:border-volt focus:outline-none"
                  >
                    <option value="">Shootout winner…</option>
                    <option value="home">{selectedMatch.home_team ?? "Home"}</option>
                    <option value="away">{selectedMatch.away_team ?? "Away"}</option>
                  </select>
                )}
              </div>
              <p className="text-xs text-muted">
                Enter the score after 90&apos; (or 120&apos; for AET/PEN) — shootout goals don&apos;t
                count. Predictions are rescored right away.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() =>
                    run("Set score", {
                      action: "set-score",
                      matchId: selectedMatch.id,
                      homeGoals: Number(homeGoals),
                      awayGoals: Number(awayGoals),
                      status: overrideStatus,
                      penaltyWinner: overrideStatus === "PEN" ? penaltyWinner : null,
                    })
                  }
                  disabled={busy !== null || !overrideReady}
                  className="display rounded bg-volt px-4 py-1.5 text-sm text-pitch hover:bg-volt-dim disabled:opacity-30"
                >
                  {busy === "Set score" ? "Saving..." : "Set final score & lock"}
                </button>
                {selectedMatch.score_locked && (
                  <button
                    onClick={() =>
                      run("Unlock score", { action: "clear-score", matchId: selectedMatch.id })
                    }
                    disabled={busy !== null}
                    className="rounded border border-line bg-panel px-4 py-1.5 text-sm font-semibold text-chalk hover:border-volt disabled:opacity-30"
                  >
                    {busy === "Unlock score" ? "Unlocking..." : "Unlock (let API overwrite)"}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Users */}
      <section className="panel p-4">
        <h2 className="mb-2 font-semibold">Create player account</h2>
        <p className="mb-3 text-sm text-muted">
          No public sign-up exists. Create accounts here with a temporary password and tell the
          person to change it from their profile, or send invites from the Supabase dashboard.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            type="email"
            placeholder="colleague@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded border border-line bg-panel px-2 py-1.5 text-sm text-chalk placeholder:text-muted focus:border-volt focus:outline-none"
          />
          <input
            type="text"
            placeholder="Temp password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded border border-line bg-panel px-2 py-1.5 text-sm text-chalk placeholder:text-muted focus:border-volt focus:outline-none"
          />
          <input
            type="text"
            placeholder="Nickname (optional)"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="rounded border border-line bg-panel px-2 py-1.5 text-sm text-chalk placeholder:text-muted focus:border-volt focus:outline-none"
          />
          <button
            onClick={() =>
              run("Create user", { action: "create-user", email, password, nickname }, () => {
                setEmail("");
                setPassword("");
                setNickname("");
              })
            }
            disabled={busy !== null || !email || !password}
            className="display rounded bg-volt px-4 py-1.5 text-sm text-pitch hover:bg-volt-dim disabled:opacity-30"
          >
            Create
          </button>
        </div>
      </section>

      {log && (
        <pre className="overflow-x-auto rounded border border-line bg-panel p-3 text-xs text-chalk">
          {log}
        </pre>
      )}
    </div>
  );
}
