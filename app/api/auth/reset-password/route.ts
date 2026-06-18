import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Sends a password-reset email, gated by a per-email / per-IP rate limit so the
// endpoint can't be used to spam someone's inbox. Always responds without
// revealing whether the email belongs to a real account.
export async function POST(request: NextRequest) {
  const { email } = await request.json().catch(() => ({ email: "" }));
  if (!email || typeof email !== "string") {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";

  const db = createAdminClient();
  const { data: allowed, error: rateError } = await db.rpc("check_password_reset_rate", {
    p_email: email,
    p_ip: ip,
  });
  if (rateError) {
    return NextResponse.json({ error: "server error" }, { status: 500 });
  }
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many reset attempts. Try again later." },
      { status: 429 }
    );
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${request.nextUrl.origin}/auth/confirm`,
  });

  // Generic response either way — never confirm whether the account exists.
  return NextResponse.json({ ok: true });
}
