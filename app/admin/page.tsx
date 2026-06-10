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
  const [{ data: settings }, { count: matchCount }, { count: userCount }] = await Promise.all([
    supabase.from("settings").select("key, value"),
    supabase.from("matches").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
  ]);

  return (
    <AdminPanel
      settings={Object.fromEntries((settings ?? []).map((s) => [s.key, s.value ?? ""]))}
      matchCount={matchCount ?? 0}
      userCount={userCount ?? 0}
    />
  );
}
