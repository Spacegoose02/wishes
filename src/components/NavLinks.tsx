"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string; icon: string; short: string };

const TABS: Tab[] = [
  { href: "/", label: "My lists", icon: "🎁", short: "Mine" },
  { href: "/shared", label: "Family lists", icon: "👨‍👩‍👧", short: "Family" },
  { href: "/chat", label: "Chat", icon: "🦝", short: "Bandit" },
  { href: "/families", label: "Families", icon: "🏡", short: "Families" },
  { href: "/notifications", label: "Alerts", icon: "🔔", short: "Alerts" },
];

function isActive(path: string, href: string) {
  if (href === "/") return path === "/" || path === "/lists/new";
  return path === href || path.startsWith(`${href}/`);
}

function Badge({ n }: { n: number }) {
  return n > 0 ? <span className="badge"><span className="sr-only">, </span>{n}<span className="sr-only"> unread</span></span> : null;
}

export function TopNav({ unread, avatar }: { unread: number; avatar: React.ReactNode }) {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={isActive(path, t.href) ? "page" : undefined}>
          {t.href === "/chat" && <span aria-hidden="true">{t.icon} </span>}
          {t.label}
          {t.href === "/notifications" && <Badge n={unread} />}
        </Link>
      ))}
      <Link href="/settings" aria-label="Settings" aria-current={isActive(path, "/settings") ? "page" : undefined}>
        {avatar}
      </Link>
    </nav>
  );
}

const BOTTOM = TABS.filter((t) => t.href !== "/families");

export function BottomNav({ unread }: { unread: number }) {
  const path = usePathname();
  return (
    <nav className="bottomnav" aria-label="Main">
      {[...BOTTOM, { href: "/settings", label: "Settings", icon: "⚙️", short: "Me" }].map((t) => (
        <Link key={t.href} href={t.href} aria-current={isActive(path, t.href) ? "page" : undefined}>
          <span className="ico" aria-hidden="true">{t.icon}</span>
          {t.short}
          {t.href === "/notifications" && <Badge n={unread} />}
        </Link>
      ))}
    </nav>
  );
}
