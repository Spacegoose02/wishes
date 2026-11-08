"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Registers the service worker that shows push alerts and keeps opened lists readable offline.
// Landing on the sign-in page (after signing out) tells it to forget the saved pages.
export function ServiceWorker() {
  const path = usePathname();
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !path.startsWith("/login")) return;
    navigator.serviceWorker.ready.then((reg) => reg.active?.postMessage("signed-out")).catch(() => {});
  }, [path]);
  return null;
}
