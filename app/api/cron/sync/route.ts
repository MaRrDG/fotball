import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { pollSync } from "@/lib/sync";

// Constant-time comparison of the Bearer token against CRON_SECRET. Returns
// false (fail closed) when the secret is unset, so a request can never pass by
// matching the literal string "Bearer undefined".
function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization");
  if (!header) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

// Called every 10 minutes by an external cron (cron-job.org, GitHub Actions,
// Vercel cron...). Protected by CRON_SECRET, supplied only in the Authorization
// header (never a query param, which would leak into request/proxy logs). The
// function itself decides whether a football-data.org request is actually needed.
export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await pollSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("sync failed:", e);
    return NextResponse.json({ ok: false, error: "internal error" }, { status: 500 });
  }
}
