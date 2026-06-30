import { redirect } from "next/navigation";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AdminPanel } from "@/components/admin-panel";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (!profile.is_admin) redirect("/");

  const supabase = await createClient();
  const [
    { count: matchCount },
    { count: userCount },
    { data: recentMatches },
    { data: teams },
    { data: groupWinners },
  ] = await Promise.all([
    supabase.from("matches").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    // Override candidates: anything already kicked off, newest first.
    supabase
      .from("matches")
      .select("id, kickoff, stage, home_team, away_team, home_goals, away_goals, status, penalty_winner, score_locked")
      .lte("kickoff", new Date().toISOString())
      .order("kickoff", { ascending: false })
      .limit(40),
    supabase.from("teams").select("name, group_name").order("group_name").order("name"),
    supabase.from("tournament_results").select("group_name, team").eq("kind", "GROUP_WINNER"),
  ]);

  return (
    <AdminPanel
      matchCount={matchCount ?? 0}
      userCount={userCount ?? 0}
      recentMatches={recentMatches ?? []}
      teams={teams ?? []}
      groupWinners={groupWinners ?? []}
    />
  );
}
