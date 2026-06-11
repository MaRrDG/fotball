import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { DonutIcon, MedalIcon, TrophyIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

const MATCH_POINTS = [
  {
    pts: "3–10",
    name: "Bulls-eye",
    desc: "Exact score. Worth more the deeper the round — see the table below.",
    example: "You said 2–1, it ended 2–1.",
    tone: "text-gold",
  },
  {
    pts: 2,
    name: "Goal difference",
    desc: "Right outcome and the exact goal difference.",
    example: "You said 3–1, it ended 2–0 — both are wins by two.",
    tone: "text-volt",
  },
  {
    pts: 1,
    name: "Trend",
    desc: "Right winner, wrong margin.",
    example: "You said 1–0, it ended 3–0.",
    tone: "text-chalk",
  },
  {
    pts: 0,
    name: "Air ball",
    desc: "Wrong outcome entirely.",
    example: "You said 2–0, it ended 0–1. Donut territory.",
    tone: "text-muted",
  },
];

// The bulls-eye (exact score) reward climbs through the knockout rounds.
// Goal-difference (+2) and trend (+1) are flat at every stage.
const STAGE_BULLSEYE = [
  { stage: "Group stage", pts: 3 },
  { stage: "Round of 32", pts: 4 },
  { stage: "Round of 16", pts: 5 },
  { stage: "Quarter-final", pts: 6 },
  { stage: "Semi-final / 3rd place", pts: 8 },
  { stage: "Final", pts: 10 },
];

export default async function RulesPage() {
  if (!(await getUserId())) redirect("/login");

  return (
    <div className="rise mx-auto max-w-3xl">
      <p className="tag mb-1">The rulebook · read once, blame nobody</p>
      <h1 className="display text-5xl leading-none">
        How to <span className="text-volt">win</span> this thing
      </h1>
      <p className="mt-3 text-sm text-muted">
        Two ways to score: predict each match, and predict the tournament itself.
        The scoring is automatic — the database does the math, nobody argues with the database.
      </p>

      {/* ---- per-match points ---- */}
      <section className="mt-10">
        <h2 className="display flex items-center gap-3 border-b border-line pb-2 text-2xl text-chalk">
          <span className="slant bg-volt px-2 py-0.5 text-base text-pitch">01</span>
          Every match
        </h2>
        <p className="mt-1 text-sm text-muted">
          Predict the score after 90 minutes (or 120 if it goes to extra time — penalty
          shootout goals never count toward the score).
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {MATCH_POINTS.map((p) => (
            <div key={p.name} className="panel p-4">
              <div className="flex items-baseline justify-between">
                <span className={`display text-3xl ${p.tone}`}>+{p.pts}</span>
                <span className="tag">{p.name}</span>
              </div>
              <p className="mt-2 text-sm text-chalk">{p.desc}</p>
              <p className="mt-1 text-xs text-muted">{p.example}</p>
            </div>
          ))}
        </div>
        <p className="tag mt-5 mb-2">Bulls-eye — exact score is worth more each round</p>
        <div className="panel overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left">
                <th className="tag px-4 py-2 !text-muted">Stage</th>
                <th className="tag px-4 py-2 text-right !text-muted">Exact score</th>
              </tr>
            </thead>
            <tbody>
              {STAGE_BULLSEYE.map((s, i) => (
                <tr key={s.stage} className={i > 0 ? "border-t border-line/50" : ""}>
                  <td className="px-4 py-2 font-medium">{s.stage}</td>
                  <td className="display px-4 py-2 text-right text-gold">+{s.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          Goal difference (+2) and trend (+1) stay the same at every stage — only the
          exact-score bonus climbs.
        </p>

        <div className="panel mt-3 flex items-center gap-4 border-volt/30 p-4">
          <span className="display text-3xl text-volt">+1</span>
          <p className="text-sm">
            <span className="font-bold">Penalty bonus.</span>{" "}
            <span className="text-muted">
              Knockout matches have a &ldquo;who advances on penalties&rdquo; pick. If it goes
              to a shootout and you named the right survivor, +1 — on top of whatever the
              score earned you.
            </span>
          </p>
        </div>
      </section>

      {/* ---- tournament points ---- */}
      <section className="mt-10">
        <h2 className="display flex items-center gap-3 border-b border-line pb-2 text-2xl text-chalk">
          <span className="slant bg-volt px-2 py-0.5 text-base text-pitch">02</span>
          The long game
        </h2>

        <div className="panel mt-4 flex items-center gap-4 p-4">
          <span className="display text-3xl text-volt">+3</span>
          <p className="text-sm">
            <span className="font-bold">Per group winner.</span>{" "}
            <span className="text-muted">
              Call the winner of each of the 12 groups before the tournament starts.
              Max 36 points.
            </span>
          </p>
        </div>

        <p className="mt-3 text-sm text-muted">
          That&apos;s the only tournament-level pick. The knockout{" "}
          <Link href="/bracket" className="text-volt hover:underline">
            bracket
          </Link>{" "}
          isn&apos;t something you fill in — it builds itself automatically as each round is
          played, so you can watch the road to the final live. No points are attached to it.
        </p>
      </section>

      {/* ---- deadlines ---- */}
      <section className="mt-10">
        <h2 className="display flex items-center gap-3 border-b border-line pb-2 text-2xl text-chalk">
          <span className="slant bg-volt px-2 py-0.5 text-base text-pitch">03</span>
          Deadlines (non-negotiable)
        </h2>
        <ul className="mt-3 space-y-2 text-sm">
          <li className="panel p-3">
            <span className="font-bold text-volt">Match predictions</span>{" "}
            <span className="text-muted">
              lock 30 minutes before kick-off. The server enforces it — a save at T-29 is
              rejected, no matter what your screen said.
            </span>
          </li>
          <li className="panel p-3">
            <span className="font-bold text-volt">Group winners</span>{" "}
            <span className="text-muted">
              lock per group — each one closes the moment that group&apos;s first match kicks off.
            </span>
          </li>
          <li className="panel p-3">
            <span className="font-bold text-volt">Blind picks.</span>{" "}
            <span className="text-muted">
              Nobody sees anyone else&apos;s prediction until the match locks. After that,
              everything is public on the match page. No copying the leader.
            </span>
          </li>
        </ul>
      </section>

      {/* ---- tie-breakers & prize ---- */}
      {/* <section className="mt-10 grid gap-4 sm:grid-cols-2">
        <div className="panel p-4">
          <h3 className="display text-xl text-chalk">Tie-breakers</h3>
          <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-muted">
            <li>Most bulls-eyes (exact scores)</li>
            <li>Guessed the World Champion</li>
            <li>Most group-stage points</li>
          </ol>
        </div>
        <div className="panel border-gold/30 p-4">
          <h3 className="display text-xl text-gold">The pot</h3>
          <ul className="mt-2 space-y-1.5 text-sm text-muted">
            <li>
              <TrophyIcon className="mr-2 inline-block h-4 w-4 text-gold" />
              1st — 60% + the Office Trophy
            </li>
            <li>
              <MedalIcon className="mr-2 inline-block h-4 w-4 text-chalk/70" />
              2nd — 25%
            </li>
            <li>
              <MedalIcon className="mr-2 inline-block h-4 w-4 text-volt-dim" />
              3rd — 15%
            </li>
            <li>
              <DonutIcon className="mr-2 inline-block h-4 w-4 text-gold" />
              Last place — donuts for everyone, day after the final
            </li>
          </ul>
        </div>
      </section> */}
    </div>
  );
}
