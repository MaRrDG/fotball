"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Matches" },
  { href: "/bracket", label: "Bracket" },
  { href: "/tournament", label: "My Picks" },
  { href: "/leaderboard", label: "Table" },
  { href: "/rules", label: "Rules" },
];

export function NavLinks({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const links = isAdmin ? [...LINKS, { href: "/admin", label: "Admin" }] : LINKS;

  return (
    <div className="flex flex-wrap items-stretch gap-1">
      {links.map(({ href, label }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`slant display whitespace-nowrap px-3 py-1.5 text-sm transition-colors md:px-4 md:py-2 ${
              active
                ? "bg-volt text-pitch"
                : href === "/admin"
                  ? "text-gold hover:bg-panel-2"
                  : "text-chalk/70 hover:bg-panel-2 hover:text-chalk"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
