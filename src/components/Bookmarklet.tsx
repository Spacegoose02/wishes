"use client";
import { useEffect, useRef } from "react";

// A bookmark-bar button: on any store page, click it to add that page to a list.
// React won't render javascript: links, so the address is set after mounting.
export function Bookmarklet({ origin }: { origin: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const code = `javascript:(()=>{window.open(${JSON.stringify(`${origin}/share?url=`)}+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title),'_blank')})()`;
    ref.current?.setAttribute("href", code);
  }, [origin]);
  return (
    <a
      ref={ref}
      href="#"
      className="btn secondary"
      onClick={(e) => {
        e.preventDefault();
        alert("Drag this button to your bookmarks bar, then click it on any store page.");
      }}
    >
      ✦ Add to Wishes
    </a>
  );
}
