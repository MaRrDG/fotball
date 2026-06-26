import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase session cookie and walls off the app:
// everything except /login, /register, /set-password, /auth/* and the cron
// route requires a session. /set-password guards itself client-side (it bounces
// to /login without a session) — it must stay public so the recovery flow,
// which establishes the session client-side via setSession(), isn't blocked by
// the proxy before that cookie has propagated.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/set-password") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/cron");

  if (!user && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Forward the verified user id to server components in a request header so
  // each page can skip its own getUser() — a round-trip to the auth server we
  // already paid here. We rebuild the headers and delete any inbound x-user-id
  // first, so the value can ONLY come from the session verified above: a client
  // cannot spoof it (the proxy runs in front of every matched route).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("x-user-id");
  if (user) requestHeaders.set("x-user-id", user.id);

  const forwarded = NextResponse.next({ request: { headers: requestHeaders } });
  // Preserve any auth cookies the session refresh queued on `response`.
  response.cookies.getAll().forEach((cookie) => forwarded.cookies.set(cookie));
  return forwarded;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
