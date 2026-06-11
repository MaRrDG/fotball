"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nickname: nickname.trim() } },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // With email confirmation OFF, signUp returns a live session and we're in.
    // With it ON (requires SMTP in Supabase), there's no session yet — the user
    // must click the link in their inbox before they can sign in.
    if (data.session) {
      router.push("/");
      router.refresh();
    } else {
      setNotice("Account created. Check your email to confirm, then sign in.");
      setLoading(false);
    }
  }

  return (
    <div className="rise mx-auto mt-14 max-w-sm">
      <p className="tag">FIFA World Cup 2026 · 48 teams · one office</p>
      <div className="display mt-2 text-8xl leading-none">
        WC<span className="text-volt">26</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="h-1 w-10 -skew-x-12 bg-volt" />
        <h1 className="display text-xl text-chalk">Join the league</h1>
      </div>
      <p className="mt-4 mb-8 text-sm text-muted">
        Pick a nickname — it&apos;s what everyone sees on the leaderboard. Predictions
        lock before kick-off, so don&apos;t leave it late.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="text"
          required
          maxLength={24}
          placeholder="Nickname (shown on the leaderboard)"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          className="field px-3 py-2.5"
        />
        <input
          type="email"
          required
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="field px-3 py-2.5"
        />
        <input
          type="password"
          required
          minLength={8}
          placeholder="Password (min 8 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field px-3 py-2.5"
        />
        {error && <p className="text-sm font-semibold text-danger">{error}</p>}
        {notice && <p className="text-sm font-semibold text-volt">{notice}</p>}
        <button type="submit" disabled={loading} className="btn-volt px-3 py-2.5 text-lg">
          {loading ? "Creating account..." : "Create account"}
        </button>
      </form>
      <p className="mt-6 text-sm text-muted">
        Already in?{" "}
        <Link href="/login" className="text-volt hover:underline">
          Sign in
        </Link>
        .
      </p>
    </div>
  );
}
