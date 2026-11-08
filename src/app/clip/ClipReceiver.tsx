"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clipPage } from "../actions/items";

type Clip = { type: "wishes-clip"; url: string; html: string };

export function ClipReceiver() {
  const router = useRouter();
  const [msg, setMsg] = useState("Reading the page you were on…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const opener = window.opener as Window | null;
    let done = false;
    const fail = (m: string) => {
      done = true;
      setFailed(true);
      setMsg(m);
    };
    if (!opener) {
      const t = setTimeout(() => fail("This page opens from the Add to Wishes bookmark on a store's product page."), 0);
      return () => clearTimeout(t);
    }
    const onMessage = async (e: MessageEvent) => {
      const d = e.data as Clip | undefined;
      if (done || e.source !== opener || d?.type !== "wishes-clip" || typeof d.url !== "string" || typeof d.html !== "string") return;
      done = true;
      setMsg("Got it! Filling in the wish…");
      const r = await clipPage(d.url, d.html).catch(() => null);
      if (r?.ok) router.replace(r.next);
      else fail(r?.error ?? "Couldn't read that page. Copy its link and paste it into a list instead.");
    };
    addEventListener("message", onMessage);
    // Keep saying hello until the store's tab answers; its listener may not be up yet.
    const hello = () => {
      if (done) return;
      try {
        opener.postMessage("wishes-clip-ready", "*");
      } catch {
        /* the store cut the link between tabs */
      }
    };
    hello();
    const timer = setInterval(hello, 500);
    const giveUp = setTimeout(() => {
      if (!done) fail("That store didn't let the bookmark send its page. Copy the link and paste it into a list instead.");
    }, 8000);
    return () => {
      removeEventListener("message", onMessage);
      clearInterval(timer);
      clearTimeout(giveUp);
    };
  }, [router]);

  return failed ? (
    <div className="card empty">
      <div className="big" aria-hidden="true">🔖</div>
      {msg} <Link href="/">Go to my lists</Link>
    </div>
  ) : (
    <div className="card empty" role="status">
      <div className="big" aria-hidden="true">✨</div>
      {msg}
    </div>
  );
}
