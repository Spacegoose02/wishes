import { useId } from "react";
import {
  INK, BearBust, BunnyBust, Backdrop, FoxBust, GooseBust, OwlBust, PartyHat, RaccoonBust, SharedDefs,
  GOOSE_PALETTES, RACCOON_PALETTES, type Fur,
} from "./CritterArt";

// Hand-drawn SVG avatars. Raccoon and goose are the house mascots, and can be rolled
// as random critters ("r:<species>:<bg>:<accessory>:<fur>"). Space Goose is the legendary roll.
// The drawings themselves live in CritterArt.tsx.

export const AVATARS = [
  { id: "raccoon", label: "Raccoon" },
  { id: "goose", label: "Goose" },
  { id: "raccoon-party", label: "Party Raccoon" },
  { id: "goose-crown", label: "Royal Goose" },
  { id: "fox", label: "Fox" },
  { id: "bear", label: "Bear" },
  { id: "owl", label: "Owl" },
  { id: "bunny", label: "Bunny" },
] as const;

export const SPACE_GOOSE = "space-goose";
// Baxter, the gift helper's own face in chat.
export const GIFT_RACCOON = "gift-raccoon";
export const AGENT_NAME = "Baxter";

const BGS = ["#cfe8ff", "#d8f5d0", "#ffe3e3", "#fff1d6", "#e7e0ff", "#ffe8f3", "#d6f5f2", "#f3f0e6"];

export const ACCESSORIES = [
  { id: "none", label: "", tier: "common" },
  { id: "bowtie", label: "Bow Tie", tier: "common" },
  { id: "flower", label: "Flower", tier: "common" },
  { id: "beanie", label: "Beanie", tier: "rare" },
  { id: "glasses", label: "Shades", tier: "rare" },
  { id: "headphones", label: "DJ", tier: "rare" },
  { id: "party", label: "Party", tier: "epic" },
  { id: "crown", label: "Royal", tier: "epic" },
  { id: "wizard", label: "Wizard", tier: "epic" },
] as const;

export type Tier = "common" | "rare" | "epic" | "legendary";
export const TIER_LABEL: Record<Tier, string> = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary" };

type Species = "raccoon" | "goose";
type Parsed = { species: Species; bg: number; acc: string; fur: number };

export function parseRandom(id: string): Parsed | null {
  const m = id.match(/^r:(raccoon|goose):(\d+):([a-z]+):(\d+)$/);
  if (!m) return null;
  return { species: m[1] as Species, bg: Number(m[2]) % BGS.length, acc: m[3], fur: Number(m[4]) % 4 };
}

export function avatarTier(id: string): Tier {
  if (id === SPACE_GOOSE) return "legendary";
  const p = parseRandom(id);
  if (p) return (ACCESSORIES.find((a) => a.id === p.acc)?.tier ?? "common") as Tier;
  return id.includes("-") ? "epic" : "common";
}

export function avatarLabel(id: string): string {
  if (id === SPACE_GOOSE) return "Space Goose";
  if (id === GIFT_RACCOON) return "Baxter the gift raccoon";
  const p = parseRandom(id);
  if (p) {
    const acc = ACCESSORIES.find((a) => a.id === p.acc)?.label;
    return `${acc ? acc + " " : ""}${p.species === "goose" ? "Goose" : "Raccoon"}`;
  }
  return AVATARS.find((a) => a.id === id)?.label ?? "Critter";
}

export function isValidAvatar(id: string): boolean {
  return id === SPACE_GOOSE || AVATARS.some((a) => a.id === id) || !!parseRandom(id);
}

// Roll odds: legendary 2%, epic 13%, rare 30%, common 55%.
// A golden roll (earned with badges) skips the commons: about 4% / 29% / 67%.
export function rollAvatar(rand: () => number = Math.random, golden = false): string {
  const r = golden ? rand() * 0.45 : rand();
  if (r < 0.02) return SPACE_GOOSE;
  const tier: Tier = r < 0.15 ? "epic" : r < 0.45 ? "rare" : "common";
  const pool = ACCESSORIES.filter((a) => a.tier === tier);
  const acc = pool[Math.floor(rand() * pool.length)].id;
  const species = rand() < 0.5 ? "goose" : "raccoon";
  return `r:${species}:${Math.floor(rand() * BGS.length)}:${acc}:${Math.floor(rand() * 4)}`;
}

// Where hats sit (head-top centre) for each species.
const ANCHOR = { raccoon: { x: 50, top: 22 }, goose: { x: 57, top: 20 } };

function Accessory({ u, id, species }: { u: string; id: string; species: Species }) {
  const a = ANCHOR[species];
  const r = species === "raccoon";
  switch (id) {
    case "party":
      return <PartyHat u={u} x={a.x + (r ? 2 : 0)} top={a.top + 3} tilt={r ? -12 : 8} scale={r ? 1 : 0.85} />;
    case "crown":
      return (
        <g transform={`translate(${a.x} ${a.top + 3}) rotate(${r ? -6 : 6}) scale(${r ? 1 : 0.85})`} strokeLinejoin="round">
          <path d="M-16 0 L-18 -18 L-9 -9 L0 -22 L9 -9 L18 -18 L16 0 Q0 4 -16 0 Z" fill={`url(#${u}gold)`} stroke={INK} strokeWidth="2" />
          <path d="M-16 -4 Q0 0 16 -4" fill="none" stroke="#e89a00" strokeWidth="1.4" />
          <circle cy="-22" r="2.6" fill="#ff5470" stroke={INK} strokeWidth="1" />
          <circle cx="-18" cy="-18" r="2" fill="#4f9dff" stroke={INK} strokeWidth="1" />
          <circle cx="18" cy="-18" r="2" fill="#4f9dff" stroke={INK} strokeWidth="1" />
          <ellipse cy="-6.5" rx="2.6" ry="3.2" fill="#3ccf6e" stroke={INK} strokeWidth="1" />
          <path d="M-12 -12 L-11 -4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity="0.7" />
        </g>
      );
    case "wizard":
      return (
        <g transform={`translate(${a.x} ${a.top + 4}) rotate(${r ? -8 : 8}) scale(${r ? 1 : 0.85})`} strokeLinejoin="round" strokeLinecap="round">
          <ellipse rx="24" ry="5.5" fill="#4b32b8" stroke={INK} strokeWidth="2" />
          <path d="M-13 -1 C-10 -14 -2 -24 6 -30 C10 -32 16 -30 18 -26 C12 -27 8 -24 8 -18 C9 -10 11 -5 13 -1 Q0 2 -13 -1 Z" fill="#6d4cf0" stroke={INK} strokeWidth="2" />
          <path d="M-12.5 -3 Q0 0 12.5 -3" fill="none" stroke="#ffd23f" strokeWidth="2.6" />
          <path d="M-2 -15 l1.6 3.4 3.7 .5 -2.7 2.6 .7 3.7 -3.3 -1.8 -3.3 1.8 .7 -3.7 -2.7 -2.6 3.7 -.5 z" fill="#ffd23f" />
          <circle cx="5" cy="-22" r="1.3" fill="#fff" />
          <circle cx="-7" cy="-7" r="1" fill="#fff" />
          <circle cx="18" cy="-26" r="2.4" fill="#ffd23f" stroke={INK} strokeWidth="1" />
        </g>
      );
    case "beanie":
      return (
        <g transform={`translate(${a.x} ${a.top + 6}) rotate(${r ? 0 : 8}) scale(${r ? 1 : 0.72})`} strokeLinejoin="round">
          <path d="M-27 0 C-27 -20 -14 -28 0 -28 C14 -28 27 -20 27 0 Z" fill="#ef5a64" stroke={INK} strokeWidth="2" />
          <path d="M-14 -4 C-13 -14 -9 -22 -4 -26 M0 -3 L0 -27 M14 -4 C13 -14 9 -22 4 -26" fill="none" stroke="#c63c48" strokeWidth="1.6" />
          <rect x="-29" y="-4" width="58" height="10" rx="5" fill="#d8434f" stroke={INK} strokeWidth="2" />
          {[-22, -14, -6, 2, 10, 18].map((x) => <path key={x} d={`M${x + 2} -2 L${x + 2} 4`} stroke="#b8323e" strokeWidth="1.4" />)}
          <circle cy="-30" r="6" fill="#fff" stroke={INK} strokeWidth="1.6" />
          <circle cx="-2" cy="-32" r="2" fill="#f0eef4" />
        </g>
      );
    case "glasses":
      return r ? (
        <g strokeLinejoin="round">
          <path d="M45 50 Q50 47 55 50" fill="none" stroke={INK} strokeWidth="2.6" />
          <path d="M22 45 L45 45 L44 54 C43 60 38 62 33 62 C27 62 23 59 22.5 54 Z" fill="#1e1a26" stroke={INK} strokeWidth="2" />
          <path d="M78 45 L55 45 L56 54 C57 60 62 62 67 62 C73 62 77 59 77.5 54 Z" fill="#1e1a26" stroke={INK} strokeWidth="2" />
          <path d="M14 47 L22 46 M86 47 L78 46" stroke={INK} strokeWidth="2.4" />
          <path d="M26 48 L31 48 L27 55 Z M59 48 L64 48 L60 55 Z" fill="#fff" opacity="0.55" />
          <path d="M23 45 L44 45" stroke="#6d6680" strokeWidth="1" />
        </g>
      ) : (
        <g strokeLinejoin="round">
          <path d="M54 28 L71 28 L70 35 C69 39 66 40.5 62.5 40.5 C58 40.5 55 38.5 54.5 35 Z" fill="#1e1a26" stroke={INK} strokeWidth="1.8" />
          <path d="M54 30 L37 33" stroke={INK} strokeWidth="2.2" />
          <path d="M57 30.5 L61 30.5 L58 36 Z" fill="#fff" opacity="0.55" />
        </g>
      );
    case "headphones":
      return r ? (
        <g strokeLinejoin="round">
          <path d="M14 50 C12 22 30 12 50 12 C70 12 88 22 86 50" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" />
          <path d="M14 50 C12 22 30 12 50 12 C70 12 88 22 86 50" fill="none" stroke="#5b5566" strokeWidth="4" strokeLinecap="round" />
          <rect x="5" y="40" width="15" height="24" rx="7" fill="#ff5fa2" stroke={INK} strokeWidth="2" />
          <rect x="80" y="40" width="15" height="24" rx="7" fill="#ff5fa2" stroke={INK} strokeWidth="2" />
          <rect x="8" y="44" width="4" height="12" rx="2" fill="#fff" opacity="0.5" />
          <rect x="83" y="44" width="4" height="12" rx="2" fill="#fff" opacity="0.5" />
        </g>
      ) : (
        <g strokeLinejoin="round">
          <path d="M40 36 C38 18 52 11 62 14 C70 17 74 23 73 29" fill="none" stroke={INK} strokeWidth="6.5" strokeLinecap="round" />
          <path d="M40 36 C38 18 52 11 62 14 C70 17 74 23 73 29" fill="none" stroke="#5b5566" strokeWidth="3.6" strokeLinecap="round" />
          <rect x="33" y="28" width="13" height="20" rx="6" fill="#ff5fa2" stroke={INK} strokeWidth="2" />
          <rect x="36" y="31.5" width="3.4" height="10" rx="1.7" fill="#fff" opacity="0.5" />
        </g>
      );
    case "bowtie": {
      const y = r ? 87 : 68;
      return (
        <g transform={`translate(50 ${y})`} strokeLinejoin="round">
          <path d="M-3 -2 L-14 -8 C-17 -4 -17 4 -14 8 L-3 2 Z" fill="#ef5a64" stroke={INK} strokeWidth="1.8" />
          <path d="M3 -2 L14 -8 C17 -4 17 4 14 8 L3 2 Z" fill="#ef5a64" stroke={INK} strokeWidth="1.8" />
          <circle cx="-9" cy="-2" r="1.3" fill="#fff" opacity="0.8" />
          <circle cx="10" cy="2" r="1.3" fill="#fff" opacity="0.8" />
          <rect x="-3.6" y="-3.6" width="7.2" height="7.2" rx="2" fill="#d8434f" stroke={INK} strokeWidth="1.8" />
        </g>
      );
    }
    case "flower": {
      const [x, y] = r ? [80, 26] : [44, 24];
      return (
        <g transform={`translate(${x} ${y})`}>
          {[0, 72, 144, 216, 288].map((d) => (
            <ellipse key={d} cy="-5.2" rx="3.8" ry="5.2" fill="#ff8fc7" stroke={INK} strokeWidth="1.2" transform={`rotate(${d})`} />
          ))}
          <circle r="3.4" fill="#ffd23f" stroke={INK} strokeWidth="1.2" />
          <circle cx="-1" cy="-1" r="1" fill="#fff" opacity="0.8" />
        </g>
      );
    }
    default:
      return null;
  }
}

function SpaceGoose({ u }: { u: string }) {
  const stars: [number, number, number][] = [[14, 18, 1.6], [84, 14, 1.2], [22, 62, 1.1], [90, 50, 1.5], [70, 6, 1], [9, 40, 1.2], [30, 6, 1]];
  return (
    <>
      <circle cx="50" cy="50" r="50" fill={`url(#${u}space)`} />
      <ellipse cx="30" cy="30" rx="40" ry="18" fill="#d946ef" opacity="0.14" transform="rotate(-25 30 30)" />
      {stars.map(([x, y, s], i) => (
        <path key={i} d={`M${x} ${y - s * 2.4} Q${x} ${y} ${x + s * 2.4} ${y} Q${x} ${y} ${x} ${y + s * 2.4} Q${x} ${y} ${x - s * 2.4} ${y} Q${x} ${y} ${x} ${y - s * 2.4} Z`} fill={i % 2 ? "#fff" : "#ffe680"} />
      ))}
      <circle cx="84" cy="82" r="9" fill={`url(#${u}planet)`} stroke={INK} strokeWidth="1.4" />
      <ellipse cx="84" cy="82" rx="16" ry="4" fill="none" stroke="#ffd23f" strokeWidth="2" transform="rotate(-20 84 82)" />
      <GooseBust u={u} scarf={false} />
      <rect x="35" y="82" width="30" height="12" rx="4" fill="#cfd8ea" stroke={INK} strokeWidth="1.8" />
      <circle cx="42" cy="88" r="2.2" fill="#ff5470" />
      <circle cx="50" cy="88" r="2.2" fill="#3dffb8" />
      <circle cx="58" cy="88" r="2.2" fill="#ffd23f" />
    </>
  );
}

function Helmet() {
  return (
    <g>
      <circle cx="59" cy="35" r="28" fill="#bfe6ff" fillOpacity="0.22" stroke="#ffffff" strokeWidth="4.5" />
      <circle cx="59" cy="35" r="28" fill="none" stroke={INK} strokeWidth="1.4" />
      <circle cx="59" cy="35" r="25.6" fill="none" stroke="#5ad1ff" strokeWidth="1.2" opacity="0.8" />
      <path d="M44 22 Q52 13 62 13" stroke="#fff" strokeWidth="3.2" fill="none" opacity="0.85" strokeLinecap="round" />
      <path d="M78 22 Q80 26 81 30" stroke="#fff" strokeWidth="2" fill="none" opacity="0.6" strokeLinecap="round" />
      <path d="M59 7 L59 0" stroke="#cfd8ea" strokeWidth="2.4" />
      <circle cx="59" cy="-1" r="3" fill="#ff5470" stroke={INK} strokeWidth="1.2" />
    </g>
  );
}

// Fur and backdrop for the fixed (non-rolled) critters.
const SIMPLE: Record<string, { fur: Fur; bg: string; Art: (p: { u: string }) => React.ReactNode }> = {
  fox: { fur: { base: "#f4892f", light: "#ffc27a", dark: "#c55a12" }, bg: "#fff1d6", Art: FoxBust },
  bear: { fur: { base: "#a8703f", light: "#d8a473", dark: "#6c4220" }, bg: "#ffe3e3", Art: BearBust },
  owl: { fur: { base: "#a27c57", light: "#d3b28a", dark: "#6a4c32" }, bg: "#e7e0ff", Art: OwlBust },
  bunny: { fur: { base: "#f4f1f8", light: "#ffffff", dark: "#d4cde0" }, bg: "#ffe8f3", Art: BunnyBust },
};

function resolve(id: string): Parsed | null {
  if (id === "goose") return { species: "goose", bg: 1, acc: "none", fur: 0 };
  if (id === "goose-crown") return { species: "goose", bg: 1, acc: "crown", fur: 0 };
  if (id === "raccoon-party") return { species: "raccoon", bg: 0, acc: "party", fur: 0 };
  if (id === "raccoon") return { species: "raccoon", bg: 0, acc: "none", fur: 0 };
  return parseRandom(id);
}

/** Baxter himself: the classic grey raccoon in his polka-dot party hat, no backdrop. */
export function BaxterArt({ u }: { u: string }) {
  return (
    <>
      <defs><SharedDefs u={u} fur={RACCOON_PALETTES[0]} /></defs>
      <RaccoonBust u={u} body={false} />
      <PartyHat u={u} x={56} top={22} tilt={14} />
    </>
  );
}

export function Avatar({ id, size = 40, title, className }: { id: string; size?: number; title?: string; className?: string }) {
  // Each avatar needs its own gradient ids when several share a page.
  const u = `av${useId().replace(/[^a-z0-9]/gi, "")}`;
  const label = title ?? avatarLabel(id);
  if (id === GIFT_RACCOON) {
    return (
      <svg className={className ?? "avatar-agent"} width={size} height={size} viewBox="4 -10 92 98" role={label ? "img" : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true}>
        <BaxterArt u={u} />
      </svg>
    );
  }
  const p = resolve(id);
  let fur: Fur | undefined;
  let bg: string;
  let body: React.ReactNode;
  let extra: React.ReactNode = null;
  if (id === SPACE_GOOSE) {
    fur = GOOSE_PALETTES[0];
    bg = "#141a3d";
    body = <SpaceGoose u={u} />;
    extra = <Helmet />;
  } else if (p) {
    fur = p.species === "goose" ? GOOSE_PALETTES[p.fur] : RACCOON_PALETTES[p.fur];
    bg = BGS[p.bg];
    body = (
      <>
        <Backdrop u={u} />
        {p.species === "goose" ? <GooseBust u={u} scarf={p.acc !== "bowtie"} /> : <RaccoonBust u={u} />}
      </>
    );
    extra = <Accessory u={u} id={p.acc} species={p.species} />;
  } else {
    const s = SIMPLE[id] ?? SIMPLE.bear;
    fur = s.fur;
    bg = s.bg;
    body = <><Backdrop u={u} /><s.Art u={u} /></>;
  }
  return (
    <svg className={`avatar ${id === SPACE_GOOSE ? "legendary" : ""}`} width={size} height={size} viewBox="0 -10 100 110" role="img" aria-label={label}>
      <defs>
        <SharedDefs u={u} fur={fur} bg={bg} />
        <clipPath id={`${u}clip`}><circle cx="50" cy="50" r="50" /></clipPath>
        {id === SPACE_GOOSE && (
          <>
            <radialGradient id={`${u}space`} cx="0.3" cy="0.25" r="0.9">
              <stop offset="0" stopColor="#5b3fd1" />
              <stop offset="0.55" stopColor="#1f2058" />
              <stop offset="1" stopColor="#0c1030" />
            </radialGradient>
            <radialGradient id={`${u}planet`} cx="0.35" cy="0.3" r="0.8">
              <stop offset="0" stopColor="#ffd08a" />
              <stop offset="1" stopColor="#f2711c" />
            </radialGradient>
          </>
        )}
      </defs>
      <g clipPath={`url(#${u}clip)`}>{body}</g>
      <circle cx="50" cy="50" r="49.2" fill="none" stroke={INK} strokeOpacity="0.12" strokeWidth="1.6" />
      {extra}
      {id === SPACE_GOOSE && <circle cx="50" cy="50" r="48" fill="none" stroke={`url(#${u}gold)`} strokeWidth="4" />}
    </svg>
  );
}

