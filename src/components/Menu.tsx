"use client";
import { useEffect, useRef } from "react";

// A small "⋯" menu built on <details>, closed by Escape or a click elsewhere.
export function Menu({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      const el = ref.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !el.contains(e.target as Node)) {
        el.open = false;
        if (e instanceof KeyboardEvent) el.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  return (
    <details ref={ref} className="menu">
      <summary className="btn small ghost" aria-label={label} title={label}>⋯</summary>
      <div className="menu-pop">{children}</div>
    </details>
  );
}
