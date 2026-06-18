"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    // Goes through a server route so the request is rate-limited before any
    // email is sent (see /api/auth/reset-password).
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Something went wrong. Try again.");
      setLoading(false);
      return;
    }
    setSent(true);
    setLoading(false);
  }

  return (
    <div className="rise mx-auto mt-16 max-w-sm">
      <div className="mt-2 flex items-center gap-2">
        <span className="h-1 w-10 -skew-x-12 bg-volt" />
        <h1 className="display text-xl text-chalk">Reset password</h1>
      </div>
      <p className="mt-4 mb-8 text-sm text-muted">
        Enter your email and we&apos;ll send you a link to set a new password.
      </p>
      {sent ? (
        <p className="text-sm font-semibold text-volt">
          Check your inbox for a reset link.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="field px-3 py-2.5"
          />
          {error && <p className="text-sm font-semibold text-danger">{error}</p>}
          <button type="submit" disabled={loading} className="btn-volt px-3 py-2.5 text-lg">
            {loading ? "Sending..." : "Send reset link"}
          </button>
        </form>
      )}
      <p className="mt-6 text-sm text-muted">
        Remembered it?{" "}
        <Link href="/login" className="text-volt hover:underline">
          Back to sign in
        </Link>
        .
      </p>
    </div>
  );
}
