"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  // Only reachable with a valid session (set by the invite/recovery link).
  // Without one there is nothing to update, so bounce back to login rather
  // than render a form that can only fail.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        router.replace("/login?error=invalid_link");
        return;
      }
      setChecking(false);
    });
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    // Revoke any other sessions so a stolen/old session can't outlive a reset.
    // The current session stays valid, so the user continues uninterrupted.
    await supabase.auth.signOut({ scope: "others" });
    router.push("/profile");
    router.refresh();
  }

  if (checking) return null;

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="display mb-1 text-3xl">Welcome to the league</h1>
      <p className="mb-6 text-sm text-muted">Choose a password for your account.</p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="password"
          required
          minLength={8}
          placeholder="New password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded border border-line bg-panel px-3 py-2.5 text-chalk placeholder:text-muted focus:border-volt focus:outline-none"
        />
        {error && <p className="text-sm font-semibold text-danger">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="display rounded bg-volt px-3 py-2.5 text-lg text-pitch hover:bg-volt-dim disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save password"}
        </button>
      </form>
    </div>
  );
}
