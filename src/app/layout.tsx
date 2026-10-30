import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "@fontsource-variable/nunito";
import "./globals.css";
import { getUser } from "@/lib/auth";
import { get } from "@/lib/db";
import { Avatar } from "@/components/Avatar";
import { THEMES } from "@/components/ThemePicker";
import { BottomNav, TopNav } from "@/components/NavLinks";

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
        <a href="#main" className="skip-link">Skip to content</a>
        {user && (
          <>
            <header className="topbar">
              <div className="topbar-inner">
                <Link href="/" className="brand">
                  <span className="spark" aria-hidden="true">✦</span> Wishes
                </Link>
                <TopNav unread={unread} avatar={<Avatar id={user.avatar} size={30} />} />
              </div>
            </header>
            <BottomNav unread={unread} />
          </>
        )}
        <main id="main" className="shell" tabIndex={-1}>{children}</main>
      </body>
    </html>
  );
}
