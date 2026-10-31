"use client";
import { useEffect, useState } from "react";
import { celebrationPieces } from "@/lib/season";

type Piece = { id: number; emoji: string; left: number; delay: number; dur: number; size: number; drift: number };

// A short burst of seasonal emoji falling across the screen. Skipped entirely for
// people who prefer reduced motion.
export function Confetti({ kind = "wish" }: { kind?: "wish" | "event" }) {
  const [pieces, setPieces] = useState<Piece[]>([]);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const set = celebrationPieces(kind);
    const start = setTimeout(() => {
      setPieces(Array.from({ length: kind === "event" ? 48 : 28 }, (_, id) => ({
        id,
        emoji: set[id % set.length],
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        dur: 1.8 + Math.random() * 1.2,
        size: 18 + Math.random() * 18,
        drift: (Math.random() - 0.5) * 120,
      })));
    }, 0);
    const stop = setTimeout(() => setPieces([]), 4000);
    return () => { clearTimeout(start); clearTimeout(stop); };
  }, [kind]);
  if (!pieces.length) return null;
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          style={{ left: `${p.left}%`, fontSize: p.size, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, "--drift": `${p.drift}px` } as React.CSSProperties}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
}
