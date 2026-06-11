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
  const [{ count: matchCount }, { count: userCount }] = await Promise.all([
    supabase.from("matches").select("id", { count: "exact", head: true }),
    supabase.from("profiles").select("id", { count: "exact", head: true }),
  ]);

  return <AdminPanel matchCount={matchCount ?? 0} userCount={userCount ?? 0} />;
}
