"use client";
import Link from "next/link";
import { useEffect } from "react";
import { Avatar } from "@/components/Avatar";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <div className="empty" style={{ marginTop: 60 }}>
      <div className="row" style={{ justifyContent: "center" }}><Avatar id="raccoon" size={80} /></div>
      <h1 style={{ marginTop: 16 }}>Something went sideways</h1>
      <p>This raccoon tripped over a cable. Try again, and if it keeps happening, check the server logs{error.digest ? ` (code ${error.digest})` : ""}.</p>
      <div className="row" style={{ justifyContent: "center" }}>
        <button type="button" className="btn" onClick={reset}>Try again</button>
        <Link href="/" className="btn secondary">Go home</Link>
      </div>
    </div>
  );
}
