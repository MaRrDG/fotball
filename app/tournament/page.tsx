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
  const [{ data: teams }, { data: gwPicks }, { data: groupMatches }] =
    await Promise.all([
      supabase.from("teams").select("*").order("group_name").order("name"),
      supabase.from("group_winner_picks").select("group_name, team").eq("user_id", userId),
      supabase.from("matches").select("kickoff, home_team").eq("stage", "GROUP"),
    ]);

  // Each group locks when its first group-stage match kicks off. Mirror the
  // group_pick_open() SQL function: map team -> group, then earliest kickoff
  // per group. The DB still enforces it via RLS; this is just for the UI.
  const teamGroup = new Map((teams ?? []).map((t) => [t.name, t.group_name]));
  const groupLocks: Record<string, string> = {};
  for (const m of groupMatches ?? []) {
    const g = m.home_team ? teamGroup.get(m.home_team) : undefined;
    if (!g) continue;
    if (!groupLocks[g] || m.kickoff < groupLocks[g]) groupLocks[g] = m.kickoff;
  }

  return (
    <TournamentForm
      userId={userId}
      teams={(teams ?? []) as Team[]}
      groupLocks={groupLocks}
      initialGroupPicks={Object.fromEntries((gwPicks ?? []).map((p) => [p.group_name, p.team]))}
    />
  );
}
