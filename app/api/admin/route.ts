import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { seedSchedule, pollSync } from "@/lib/sync";

// Admin actions, dispatched on { action, ...payload }. Caller must be a
// signed-in user whose profile has is_admin = true.
export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const db = createAdminClient();

  try {
    switch (body.action) {
      case "seed": {
        const result = await seedSchedule();
        return NextResponse.json({ ok: true, ...result });
      }

      case "sync": {
        const result = await pollSync();
        return NextResponse.json({ ok: true, ...result });
      }

      case "create-user": {
        const { email, password, nickname } = body;
        if (!email || !password) {
          return NextResponse.json({ error: "email and password required" }, { status: 400 });
        }
        const { data, error } = await db.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: nickname ? { nickname } : undefined,
        });
        if (error) return NextResponse.json({ error: error.message }, { status: 400 });
        return NextResponse.json({ ok: true, userId: data.user?.id });
      }

      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    console.error("admin action failed:", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
