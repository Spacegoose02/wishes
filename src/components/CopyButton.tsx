"use client";
import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn small secondary"
      onClick={async () => {
        const full = text.startsWith("/") ? window.location.origin + text : text;
        try { await navigator.clipboard.writeText(full); } catch { window.prompt("Copy this link", full); }
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Copied!" : label}
    </button>
  );
}
