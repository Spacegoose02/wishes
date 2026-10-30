"use client";
import { useEffect, useState } from "react";

// Shows a ?ok= / ?error= message as a toast, then tidies the URL so a refresh doesn't repeat it.
export function Toast({ kind, message }: { kind: "ok" | "error"; message: string }) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("ok");
    url.searchParams.delete("error");
    window.history.replaceState(window.history.state, "", url);
    const t = setTimeout(() => setOpen(false), kind === "error" ? 9000 : 4500);
    return () => clearTimeout(t);
  }, [kind]);

  if (!open) return null;
  return (
    <div className={`toast ${kind}`} role={kind === "error" ? "alert" : "status"}>
      <span aria-hidden="true">{kind === "error" ? "⚠️" : "✅"}</span>
      <span>{message}</span>
      <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => setOpen(false)}>×</button>
    </div>
  );
}
