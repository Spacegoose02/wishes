import { useId } from "react";
import { LogoArt } from "./CritterArt";

/** The Wishes logo: Baxter holding his wish list. Decorative unless given a title. */
export function Logo({ height = 36, className, title }: { height?: number; className?: string; title?: string }) {
  const u = `lg${useId().replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg
      className={className} height={height} width={Math.round((height * 120) / 150)} viewBox="0 -18 120 150"
      role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}
    >
      <LogoArt u={u} />
    </svg>
  );
}
