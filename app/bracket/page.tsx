import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Bracket } from "@/components/bracket";
import type { Match } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function BracketPage() {
  const userId = await getUserId();
  if (!userId) redirect("/login");

  const supabase = await createClient();
  const [{ data: matches }, { data: champRow }] = await Promise.all([
    supabase
      .from("matches")
      .select("*")
      .in("stage", ["R32", "R16", "QF", "SF", "3RD", "F"])
      .order("kickoff"),
    supabase.from("tournament_results").select("team").eq("kind", "CHAMP").maybeSingle(),
  ]);

  const knockout = (matches ?? []) as Match[];

  return (
    <div className="rise">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display text-4xl text-chalk">
            The <span className="text-volt">Road</span> to the Final
          </h1>
          <p className="mt-1 text-sm text-muted">
            Live knockout bracket — fills in automatically as each round is played.
          </p>
        </div>
        <Link href="/rules" className="tag !text-volt hover:underline">
          How points work →
        </Link>
      </div>

      {knockout.length === 0 ? (
        <div className="panel mx-auto max-w-lg p-8 text-center">
          <div className="display text-2xl text-chalk">Group stage in progress</div>
          <p className="mt-2 text-sm text-muted">
            The bracket appears here once the Round of 32 is drawn. Until then, call your{" "}
            <Link href="/tournament" className="text-volt hover:underline">
              group winners
            </Link>{" "}
            and predict the{" "}
            <Link href="/" className="text-volt hover:underline">
              daily matches
            </Link>
            .
          </p>
        </div>
      ) : (
        <Bracket matches={knockout} champion={champRow?.team ?? null} />
      )}
    </div>
  );
}
