import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  seedSchedule,
  pollSync,
  setManualScore,
  clearManualScore,
  setGroupWinners,
  clearGroupWinner,
} from "@/lib/sync";

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

      case "set-score": {
        const { matchId, homeGoals, awayGoals, status, penaltyWinner } = body;
        const validGoals = (g: unknown) => Number.isInteger(g) && (g as number) >= 0 && (g as number) <= 99;
        if (!Number.isInteger(matchId) || !validGoals(homeGoals) || !validGoals(awayGoals)) {
          return NextResponse.json(
            { error: "matchId and goals (0-99) required" },
            { status: 400 }
          );
        }
        if (!["FT", "AET", "PEN"].includes(status)) {
          return NextResponse.json({ error: "status must be FT, AET or PEN" }, { status: 400 });
        }
        if (status === "PEN" && !["home", "away"].includes(penaltyWinner)) {
          return NextResponse.json(
            { error: "penaltyWinner (home/away) required when status is PEN" },
            { status: 400 }
          );
        }
        if (status === "PEN" && homeGoals !== awayGoals) {
          return NextResponse.json(
            { error: "a penalty shootout implies a drawn match — goals must be equal" },
            { status: 400 }
          );
        }
        const result = await setManualScore({
          matchId,
          homeGoals,
          awayGoals,
          status,
          penaltyWinner: status === "PEN" ? penaltyWinner : null,
        });
        return NextResponse.json({ ok: true, ...result });
      }

      case "clear-score": {
        const { matchId } = body;
        if (!Number.isInteger(matchId)) {
          return NextResponse.json({ error: "matchId required" }, { status: 400 });
        }
        const result = await clearManualScore(matchId);
        return NextResponse.json({ ok: true, ...result });
      }

      case "set-group-winners": {
        const { winners } = body;
        if (!Array.isArray(winners) || winners.length === 0) {
          return NextResponse.json({ error: "winners array required" }, { status: 400 });
        }
        if (winners.some((w) => typeof w?.group !== "string" || typeof w?.team !== "string")) {
          return NextResponse.json(
            { error: "each winner needs a group and a team" },
            { status: 400 }
          );
        }
        // setGroupWinners validates group/team against the teams table.
        const result = await setGroupWinners(winners);
        return NextResponse.json({ ok: true, ...result });
      }

      case "clear-group-winner": {
        const { group } = body;
        if (typeof group !== "string" || !group) {
          return NextResponse.json({ error: "group required" }, { status: 400 });
        }
        const result = await clearGroupWinner(group);
        return NextResponse.json({ ok: true, ...result });
      }

      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (e) {
    console.error("admin action failed:", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
