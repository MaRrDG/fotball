import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/** Current user's profile, or null when not signed in. */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, nickname, is_admin")
    .eq("id", user.id)
    .single();
  return data;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile?.is_admin) throw new Error("forbidden");
  return profile;
}
