"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    searchParams.get("error") === "invalid_link" ? "That link is invalid or expired." : null
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <div className="rise mx-auto mt-14 max-w-sm">
      <p className="tag">FIFA World Cup 2026 · 48 teams · one office</p>
      <div className="display mt-2 text-8xl leading-none">
        WC<span className="text-volt">26</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="h-1 w-10 -skew-x-12 bg-volt" />
        <h1 className="display text-xl text-chalk">Office Predictor</h1>
      </div>
      <p className="mt-4 mb-8 text-sm text-muted">
        Private league — accounts are created by the admin. No account? Ask them.
        Donut duty is real.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
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
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="field px-3 py-2.5"
        />
        {error && <p className="text-sm font-semibold text-danger">{error}</p>}
        <button type="submit" disabled={loading} className="btn-volt px-3 py-2.5 text-lg">
          {loading ? "Signing in..." : "Kick off"}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
