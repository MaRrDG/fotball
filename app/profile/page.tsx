"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ProfilePage() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("nickname")
        .eq("id", user.id)
        .single();
      if (data) setNickname(data.nickname);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("profiles")
      .update({ nickname: nickname.trim() })
      .eq("id", user.id);
    setMessage(error ? error.message : "Saved! This is the name on the leaderboard.");
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="display mb-1 text-3xl">Your profile</h1>
      <p className="mb-6 text-sm text-muted">
        Pick the nickname shown on the leaderboard.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="text"
          required
          maxLength={24}
          placeholder="Nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          className="rounded border border-line bg-panel px-3 py-2.5 text-chalk placeholder:text-muted focus:border-volt focus:outline-none"
        />
        {message && <p className="text-sm text-volt">{message}</p>}
        <button
          type="submit"
          disabled={loading}
          className="display rounded bg-volt px-3 py-2.5 text-lg text-pitch hover:bg-volt-dim disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save nickname"}
        </button>
      </form>
    </div>
  );
}
