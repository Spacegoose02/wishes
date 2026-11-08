"use client";
import { useEffect } from "react";

// Registers the service worker that shows push alerts (and keeps lists readable offline).
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
