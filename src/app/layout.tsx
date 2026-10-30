import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "@fontsource-variable/nunito";
import "./globals.css";
import { getUser } from "@/lib/auth";
import { get } from "@/lib/db";
import { Avatar } from "@/components/Avatar";
import { THEMES } from "@/components/ThemePicker";

export const metadata: Metadata = {
  title: { default: "Wishes", template: "%s · Wishes" },
  description: "Family wishlists for kids and grown-ups",
  applicationName: "Wishes",
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192" }], apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Wishes", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

// The browser/status bar follows the signed-in user's theme.
export async function generateViewport(): Promise<Viewport> {
  const user = await getUser();
  const theme = THEMES.find((t) => t.id === user?.theme);
  return {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    themeColor: theme && theme.id !== "system"
      ? theme.colors[0]
      : [{ media: "(prefers-color-scheme: light)", color: "#fdfaf4" }, { media: "(prefers-color-scheme: dark)", color: "#15161a" }],
  };
}

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
                  <Link href="/chat">🦝 Chat</Link>
                  <Link href="/families">Families</Link>
                  <Link href="/notifications">
                    Alerts{unread > 0 && <span className="badge">{unread}</span>}
                  </Link>
                  <Link href="/settings" aria-label="Settings">
                    <Avatar id={user.avatar} size={30} />
                  </Link>
                </nav>
              </div>
            </header>
            <nav className="bottomnav">
              <Link href="/"><span className="ico">🎁</span>Mine</Link>
              <Link href="/shared"><span className="ico">👨‍👩‍👧</span>Family</Link>
              <Link href="/chat"><span className="ico">🦝</span>Bandit</Link>
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
