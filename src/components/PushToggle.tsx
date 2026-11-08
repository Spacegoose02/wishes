"use client";
import { useEffect, useState } from "react";
import { removePushSubscription, savePushSubscription } from "@/app/actions/account";

type State = "checking" | "unsupported" | "denied" | "off" | "on" | "working";

function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// Turns push alerts on or off for this one device (phone, tablet or computer).
export function PushToggle({ publicKey }: { publicKey: string }) {
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function turnOn() {
    setState("working");
    setError("");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "denied" : "off");
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      const r = await savePushSubscription(JSON.stringify(sub));
      if (!r.ok) {
        await sub.unsubscribe();
        setError(r.error ?? "Couldn't turn alerts on.");
        return setState("off");
      }
      setState("on");
    } catch (e) {
      setError((e as Error).message || "Couldn't turn alerts on.");
      setState("off");
    }
  }

  async function turnOff() {
    setState("working");
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await removePushSubscription(sub.endpoint);
      await sub.unsubscribe();
    }
    setState("off");
  }

  if (state === "checking") return <p className="small muted m0">Checking this device…</p>;
  if (state === "unsupported") {
    return (
      <p className="small muted m0">
        This browser can&apos;t get push alerts. On an iPhone or iPad, add Wishes to your home screen first (Share, then Add to Home Screen), then open it from there.
      </p>
    );
  }
  if (state === "denied") return <p className="small muted m0">Notifications are blocked for Wishes in this browser&apos;s settings. Allow them there, then come back.</p>;
  return (
    <div className="stack">
      <div className="row gap-8">
        {state === "on" ? (
          <>
            <span className="pill good">🔔 On for this device</span>
            <button type="button" className="btn small ghost" onClick={turnOff}>Turn off here</button>
          </>
        ) : (
          <button type="button" className="btn small" onClick={turnOn} disabled={state === "working"}>
            {state === "working" ? "Turning on…" : "🔔 Turn on alerts for this device"}
          </button>
        )}
      </div>
      {error && <p className="small m0 text-bad" role="alert">{error}</p>}
    </div>
  );
}
