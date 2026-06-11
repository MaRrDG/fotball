"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  matchCount: number;
  userCount: number;
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

export function AdminPanel({ matchCount, userCount }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");

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
