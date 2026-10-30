"use client";
import { useState } from "react";

// A wrapped present that opens on tap. The unwrap animation is CSS, so reduced-motion
// users just see it open.
export function GiftBox({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (open) return <div className="gift-open">{children}</div>;
  return (
    <button type="button" className="gift-box" onClick={() => setOpen(true)} aria-label={`Unwrap ${label}`}>
      <span className="gift-lid" aria-hidden="true" />
      <span className="gift-body" aria-hidden="true" />
      <span className="gift-hint">Tap to unwrap</span>
    </button>
  );
}
