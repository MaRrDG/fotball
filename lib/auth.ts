import { headers } from "next/headers";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";

/**
 * The signed-in user's id, or null. Read from the x-user-id header that the
 * proxy sets from a verified getUser() (see proxy.ts) — so this is free, no
 * round-trip, and just as trustworthy as calling getUser() here would be.
 */
export async function getUserId(): Promise<string | null> {
  const h = await headers();
  return h.get("x-user-id") || null;
}

/**
 * Current user's profile, or null when not signed in.
 * cache(): if several server components in one render ask for it (e.g. the nav
 * and the page), the profiles query runs once.
 */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const userId = await getUserId();
  if (!userId) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, nickname, is_admin")
    .eq("id", userId)
    .single();
  return data;
});

export async function requireAdmin(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile?.is_admin) throw new Error("forbidden");
  return profile;
}
