import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TournamentForm } from "@/components/tournament-form";
import type { Team } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function TournamentPage() {
  const userId = await getUserId();
  if (!userId) redirect("/login");

  const supabase = await createClient();
  const [{ data: teams }, { data: settings }, { data: gwPicks }, { data: bracketPicks }] =
    await Promise.all([
      supabase.from("teams").select("*").order("group_name").order("name"),
      supabase.from("settings").select("key, value"),
      supabase.from("group_winner_picks").select("group_name, team").eq("user_id", userId),
      supabase.from("bracket_picks").select("round, team").eq("user_id", userId),
    ]);

  const settingsMap = Object.fromEntries((settings ?? []).map((s) => [s.key, s.value]));

  return (
    <TournamentForm
      userId={userId}
      teams={(teams ?? []) as Team[]}
      groupPicksLock={settingsMap["group_picks_lock"] ?? null}
      bracketOpen={settingsMap["bracket_picks_open"] ?? null}
      bracketLock={settingsMap["bracket_picks_lock"] ?? null}
      initialGroupPicks={Object.fromEntries((gwPicks ?? []).map((p) => [p.group_name, p.team]))}
      initialBracketPicks={(bracketPicks ?? []) as { round: string; team: string }[]}
    />
  );
}
