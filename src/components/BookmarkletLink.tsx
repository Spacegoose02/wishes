"use client";
import { useEffect, useRef } from "react";
import { bookmarkletCode } from "@/lib/clip";

// React won't render a javascript: link, so the bookmark's address is set after it mounts.
export function BookmarkletLink() {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    ref.current?.setAttribute("href", bookmarkletCode(window.location.origin));
  }, []);
  return (
    <a
      ref={ref}
      className="btn"
      draggable
      onClick={(e) => {
        e.preventDefault();
        alert("Drag this button up to your bookmarks bar, then click it there on a store's product page.");
      }}
    >
      🔖 Add to Wishes
    </a>
  );
}
