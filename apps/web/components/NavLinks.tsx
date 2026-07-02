"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/map", label: "Map" },
  { href: "/agent", label: "Agent" },
  { href: "/use-with-agent", label: "Use with agent" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="sitenav__links">
      {LINKS.map((l) => {
        const active = pathname === l.href || pathname.startsWith(l.href + "/");
        return (
          <Link key={l.href} href={l.href} className={active ? "is-active" : undefined}
            aria-current={active ? "page" : undefined}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
