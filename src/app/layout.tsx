import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { getUser } from "@/lib/auth";
import { get } from "@/lib/db";
import { Avatar } from "@/components/Avatar";

export const metadata: Metadata = {
  title: "Wishes",
  description: "Family wishlists for kids and grown-ups",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  const unread = user
    ? get<{ n: number }>("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0", user.id)!.n
    : 0;
  return (
    <html lang="en" data-theme={user?.theme ?? "system"} suppressHydrationWarning>
      <body>
        {user && (
          <>
            <header className="topbar">
              <div className="topbar-inner">
                <Link href="/" className="brand">
                  <span className="spark">✦</span> Wishes
                </Link>
                <nav className="nav">
                  <Link href="/">My lists</Link>
                  <Link href="/shared">Family lists</Link>
                  <Link href="/families">Families</Link>
                  <Link href="/notifications">
                    Alerts{unread > 0 && <span className="badge">{unread}</span>}
                  </Link>
                  {user.is_admin ? <Link href="/admin">Admin</Link> : null}
                  <Link href="/settings" aria-label="Settings">
                    <Avatar id={user.avatar} size={30} />
                  </Link>
                </nav>
              </div>
            </header>
            <nav className="bottomnav">
              <Link href="/"><span className="ico">🎁</span>Mine</Link>
              <Link href="/shared"><span className="ico">👨‍👩‍👧</span>Family</Link>
              <Link href="/families"><span className="ico">🏡</span>Groups</Link>
              <Link href="/notifications"><span className="ico">🔔</span>Alerts{unread > 0 && <span className="badge">{unread}</span>}</Link>
              <Link href="/settings"><span className="ico">⚙️</span>Me</Link>
            </nav>
          </>
        )}
        <main className="shell">{children}</main>
      </body>
    </html>
  );
}
