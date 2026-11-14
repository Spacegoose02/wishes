"use client";
import { useSyncExternalStore } from "react";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

// Says so when the page is a saved copy, so nobody wonders why buttons don't work.
export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div className="offline-banner" role="status">
      📡 You&apos;re offline. This is the last saved copy; claims and changes need a connection.
    </div>
  );
}
