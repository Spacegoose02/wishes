"use client";
import { useSyncExternalStore } from "react";
import { ANDROID_APP_SWITCH_SERVER_URL, isAndroidApp } from "@/lib/android-app";

const noSubscribe = () => () => {};

// Shown only inside the Wishes Android app: which server it's using, and a way to pick another.
export function AndroidAppServer() {
  const server = useSyncExternalStore(
    noSubscribe,
    () => (isAndroidApp() ? window.location.host : ""),
    () => "",
  );

  if (!server) return null;
  return (
    <section className="card stack">
      <h2 className="m0">📱 Android app</h2>
      <div className="row gap-8" style={{ flexWrap: "wrap" }}>
        <p className="small muted m0 grow">
          Connected to <strong>{server}</strong>.
        </p>
        <a className="btn small secondary" href={ANDROID_APP_SWITCH_SERVER_URL}>Switch server</a>
      </div>
    </section>
  );
}
