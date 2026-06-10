import Link from "next/link";
import { getProfile } from "@/lib/auth";
import { NavLinks } from "@/components/nav-links";

export async function Nav() {
  const profile = await getProfile();
  if (!profile) return null;

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-pitch/95 backdrop-blur">
      <nav className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5">
        <Link href="/" className="display order-1 flex items-baseline text-2xl leading-none">
          <span className="text-volt">WC</span>
          <span className="text-chalk">26</span>
          <span className="ml-1.5 inline-block h-2 w-2 -skew-x-12 bg-volt" />
        </Link>
        <div className="order-3 w-full md:order-2 md:w-auto">
          <NavLinks isAdmin={profile.is_admin} />
        </div>
        <div className="order-2 ml-auto flex items-center gap-3 md:order-3">
          <Link
            href="/profile"
            className="slant border border-line bg-panel px-3 py-1.5 text-xs font-bold tracking-wide text-chalk transition-colors hover:border-volt hover:text-volt"
          >
            {profile.nickname}
          </Link>
          <form action="/auth/signout" method="post">
            <button className="tag !text-muted transition-colors hover:!text-danger" type="submit">
              Out
            </button>
          </form>
        </div>
      </nav>
    </header>
  );
}
