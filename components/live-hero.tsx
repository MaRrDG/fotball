"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { STAGE_LABELS, type Match, type Prediction } from "@/lib/types";
import { TeamCrest } from "@/components/team-crest";

interface Props {
  matches: Match[];
  /** user's predictions keyed by match id (plain object — survives RSC serialization) */
  predictions: Record<number, Prediction>;
}

export function LiveHero({ matches, predictions }: Props) {
  const router = useRouter();

  // Re-pull server data periodically so the score follows the sync cron
  // without a manual reload.
  useEffect(() => {
    const data = setInterval(() => router.refresh(), 60_000);
    return () => clearInterval(data);
  }, [router]);

  return (
    <section className="rise mb-10">
      <h2 className="mb-3 flex items-center gap-3">
        <span className="slant display bg-danger px-3 py-1 text-sm text-pitch">
          <span className="live-dot">●</span> Match in progress
        </span>
        <span className="h-px flex-1 bg-danger/30" />
        <span className="tag">score may update only at half-time / full-time ( due to API limitations )</span>
      </h2>

      <div className="flex flex-col gap-4">
        {matches.map((m) => {
          const p = predictions[m.id];
          return (
            <div key={m.id} className="panel live-card relative overflow-hidden">
              <span className="live-sweep" aria-hidden />

              {/* broadcast meta strip */}
              <div className="flex items-center justify-between border-b border-danger/20 bg-danger/10 px-3 py-1.5">
                <span className="slant display bg-panel-2 px-2.5 py-0.5 text-[11px] text-volt">
                  {STAGE_LABELS[m.stage]}
                </span>
                <span className="display text-sm leading-none text-danger">
                  <span className="live-dot">●</span> Live
                </span>
              </div>

              {/* big scoreboard */}
              <div className="flex items-center gap-4 px-5 py-6">
                <span className="flex flex-1 items-center justify-end gap-2.5 overflow-hidden">
                  <span className="display truncate text-right text-2xl leading-none sm:text-3xl">
                    {m.home_team ?? "TBD"}
                  </span>
                  <TeamCrest src={m.home_crest} className="h-7 w-7" />
                </span>
                <span className="slant display min-w-28 bg-pitch px-5 py-2 text-center text-4xl leading-none sm:text-5xl">
                  <span className="text-volt">{m.home_goals ?? 0}</span>
                  <span className="mx-1.5 text-muted">:</span>
                  <span className="text-volt">{m.away_goals ?? 0}</span>
                </span>
                <span className="flex flex-1 items-center gap-2.5 overflow-hidden">
                  <TeamCrest src={m.away_crest} className="h-7 w-7" />
                  <span className="display truncate text-2xl leading-none sm:text-3xl">
                    {m.away_team ?? "TBD"}
                  </span>
                </span>
              </div>

              {/* footer strip */}
              <div className="flex items-center justify-between border-t border-line/50 bg-pitch/30 px-3 py-2 text-xs">
                <span className="text-muted">
                  {p
                    ? `Your pick: ${p.home_goals}–${p.away_goals}` +
                      (p.penalty_winner
                        ? ` · pens: ${p.penalty_winner === "home" ? m.home_team : m.away_team}`
                        : "")
                    : "No prediction"}
                </span>
                <Link
                  href={`/match/${m.id}`}
                  prefetch={false}
                  className="font-bold text-volt hover:underline"
                >
                  Everyone&apos;s picks →
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
