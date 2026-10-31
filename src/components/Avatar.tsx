// Hand-drawn SVG avatars. Raccoon and goose are the house mascots, and can be rolled
// as random critters ("r:<species>:<bg>:<accessory>:<fur>"). Space Goose is the legendary roll.

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
// Bandit, the gift helper's own face in chat.
export const GIFT_RACCOON = "gift-raccoon";
export const AGENT_NAME = "Bandit";

const BGS = ["#cfe8ff", "#d8f5d0", "#ffe3e3", "#fff1d6", "#e7e0ff", "#ffe8f3", "#d6f5f2", "#f3f0e6"];
const RACCOON_FUR = ["#8a8f9c", "#a0785a", "#9aa7c7", "#b79ac8"];
const GOOSE_BODY = ["#ffffff", "#f6ecd6", "#dcdcdc", "#ffe0ec"];

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
  if (id === GIFT_RACCOON) return "Bandit the gift raccoon";
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

function RaccoonBody({ fur = RACCOON_FUR[0] }: { fur?: string }) {
  return (
    <>
      <path d="M18 30 L28 8 L42 26 Z" fill={fur} />
      <path d="M82 30 L72 8 L58 26 Z" fill={fur} />
      <path d="M22 26 L28 14 L36 24 Z" fill="#2d2f36" />
      <path d="M78 26 L72 14 L64 24 Z" fill="#2d2f36" />
      <ellipse cx="50" cy="56" rx="36" ry="32" fill={fur} />
      <ellipse cx="50" cy="70" rx="22" ry="16" fill="#f1f1f4" />
      <path d="M14 50 Q30 36 46 50 Q30 62 14 50 Z" fill="#2d2f36" />
      <path d="M86 50 Q70 36 54 50 Q70 62 86 50 Z" fill="#2d2f36" />
      <circle cx="32" cy="50" r="6" fill="#fff" />
      <circle cx="68" cy="50" r="6" fill="#fff" />
      <circle cx="33" cy="51" r="3.4" fill="#111" />
      <circle cx="67" cy="51" r="3.4" fill="#111" />
      <path d="M44 33 Q50 28 56 33 L50 44 Z" fill="#f1f1f4" />
      <ellipse cx="50" cy="64" rx="6" ry="4.5" fill="#1b1c20" />
      <path d="M43 74 Q50 80 57 74" stroke="#1b1c20" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </>
  );
}

function GooseBody({ body = GOOSE_BODY[0], scarf = true }: { body?: string; scarf?: boolean }) {
  return (
    <>
      <ellipse cx="50" cy="92" rx="34" ry="22" fill={body} />
      <path d="M38 92 Q34 60 40 40 Q44 22 54 22 Q66 22 66 36 Q66 48 58 58 Q54 70 58 92 Z" fill={body} stroke="#e3e3e3" strokeWidth="1.5" />
      <path d="M62 34 Q80 34 86 40 Q80 46 62 44 Z" fill="#ff9f1c" />
      <path d="M63 39 L84 40" stroke="#d97706" strokeWidth="1.5" />
      <circle cx="56" cy="32" r="3.6" fill="#111" />
      <circle cx="57.2" cy="31" r="1.1" fill="#fff" />
      <path d="M50 26 Q53 23 58 25" stroke="#111" strokeWidth="2" fill="none" strokeLinecap="round" />
      <ellipse cx="46" cy="40" rx="4" ry="2.4" fill="#ffc6d9" opacity="0.8" />
      {scarf && <path d="M40 66 Q50 72 60 66 L58 74 Q50 78 42 74 Z" fill="#4f9dff" />}
    </>
  );
}

// Accessory positions per species: head-top anchor and eye line.
const ANCHOR = { raccoon: { x: 50, top: 26, eyeY: 50 }, goose: { x: 55, top: 23, eyeY: 32 } };

function Accessory({ id, species }: { id: string; species: Species }) {
  const a = ANCHOR[species];
  switch (id) {
    case "party":
      return (
        <g>
          <path d={`M${a.x - 12} ${a.top} L${a.x} ${a.top - 26} L${a.x + 12} ${a.top} Z`} fill="#ff5fa2" />
          <circle cx={a.x} cy={a.top - 26} r="4" fill="#ffd23f" />
          <circle cx={a.x - 4} cy={a.top - 8} r="2" fill="#ffd23f" />
          <circle cx={a.x + 4} cy={a.top - 14} r="2" fill="#5ad1ff" />
        </g>
      );
    case "crown":
      return (
        <path
          d={`M${a.x - 13} ${a.top} L${a.x - 11} ${a.top - 14} L${a.x - 5} ${a.top - 6} L${a.x} ${a.top - 16} L${a.x + 5} ${a.top - 6} L${a.x + 11} ${a.top - 14} L${a.x + 13} ${a.top} Z`}
          fill="#ffd23f" stroke="#e0a800" strokeWidth="1.5"
        />
      );
    case "wizard":
      return (
        <g>
          <ellipse cx={a.x} cy={a.top} rx="20" ry="5" fill="#5b3fd1" />
          <path d={`M${a.x - 12} ${a.top} Q${a.x - 2} ${a.top - 18} ${a.x + 8} ${a.top - 32} Q${a.x + 6} ${a.top - 14} ${a.x + 12} ${a.top} Z`} fill="#6d4cf0" />
          <path d={`M${a.x} ${a.top - 12} l2 4 4 .5 -3 3 1 4 -4 -2 -4 2 1 -4 -3 -3 4 -.5 z`} fill="#ffd23f" />
        </g>
      );
    case "beanie":
      return species === "raccoon" ? (
        <g>
          <path d="M22 30 Q50 -2 78 30 Z" fill="#e8505b" />
          <rect x="20" y="26" width="60" height="8" rx="4" fill="#c73a45" />
          <circle cx="50" cy="8" r="5" fill="#fff" />
        </g>
      ) : (
        <g>
          <path d="M41 28 Q55 6 69 28 Z" fill="#e8505b" />
          <rect x="40" y="25" width="30" height="6" rx="3" fill="#c73a45" />
          <circle cx="55" cy="12" r="4" fill="#fff" />
        </g>
      );
    case "glasses":
      return species === "raccoon" ? (
        <g>
          <rect x="20" y="43" width="25" height="14" rx="6" fill="#111" />
          <rect x="55" y="43" width="25" height="14" rx="6" fill="#111" />
          <path d="M45 48 L55 48" stroke="#111" strokeWidth="3" />
          <path d="M24 46 L30 46" stroke="#fff" strokeWidth="2" opacity="0.6" />
        </g>
      ) : (
        <g>
          <rect x="49" y="27" width="15" height="10" rx="4" fill="#111" />
          <path d="M44 30 L49 31" stroke="#111" strokeWidth="2.5" />
        </g>
      );
    case "headphones":
      return species === "raccoon" ? (
        <g>
          <path d="M16 50 Q16 14 50 14 Q84 14 84 50" stroke="#333" strokeWidth="5" fill="none" />
          <rect x="9" y="42" width="12" height="20" rx="5" fill="#ff5fa2" />
          <rect x="79" y="42" width="12" height="20" rx="5" fill="#ff5fa2" />
        </g>
      ) : (
        <g>
          <path d="M42 36 Q42 16 56 16 Q68 16 68 34" stroke="#333" strokeWidth="4" fill="none" />
          <rect x="37" y="30" width="9" height="14" rx="4" fill="#ff5fa2" />
        </g>
      );
    case "bowtie":
      return species === "raccoon" ? (
        <path d="M38 84 L50 90 L62 84 L62 96 L50 90 L38 96 Z" fill="#e8505b" />
      ) : (
        <path d="M40 66 L50 71 L60 66 L60 76 L50 71 L40 76 Z" fill="#e8505b" />
      );
    case "flower": {
      const [x, y] = species === "raccoon" ? [76, 24] : [45, 25];
      return (
        <g>
          {[0, 72, 144, 216, 288].map((r) => (
            <ellipse key={r} cx={x} cy={y - 5} rx="3.5" ry="5" fill="#ff8fc7" transform={`rotate(${r} ${x} ${y})`} />
          ))}
          <circle cx={x} cy={y} r="3" fill="#ffd23f" />
        </g>
      );
    }
    default:
      return null;
  }
}

function SpaceGoose() {
  const stars = [[14, 18], [84, 14], [22, 60], [88, 52], [70, 8], [10, 40], [92, 78], [30, 8]];
  return (
    <>
      <circle cx="50" cy="50" r="50" fill="#141a3d" />
      <circle cx="50" cy="50" r="50" fill="url(#space-glow)" />
      {stars.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 2.4 : 1.5} fill={i % 2 ? "#fff" : "#ffd23f"} />)}
      <circle cx="80" cy="82" r="10" fill="#ff9f1c" />
      <ellipse cx="80" cy="82" rx="16" ry="4" fill="none" stroke="#ffd23f" strokeWidth="2" transform="rotate(-20 80 82)" />
      <ellipse cx="50" cy="94" rx="32" ry="20" fill="#e9eef8" />
      <rect x="38" y="78" width="24" height="10" rx="3" fill="#cfd8ea" />
      <circle cx="44" cy="83" r="2" fill="#ff5470" />
      <circle cx="50" cy="83" r="2" fill="#3dffb8" />
      <GooseBody scarf={false} />
    </>
  );
}

// Raccoon hugging a wrapped present, with a bow on its head.
function GiftRaccoon() {
  return (
    <>
      <circle cx="50" cy="50" r="50" fill="#ffe8d6" />
      <circle cx="18" cy="16" r="2" fill="#ffb547" />
      <circle cx="84" cy="22" r="2.5" fill="#ff7a59" />
      <circle cx="12" cy="62" r="1.8" fill="#d946ef" />
      <RaccoonBody />
      <rect x="30" y="78" width="40" height="26" rx="4" fill="#ff5470" />
      <rect x="46" y="78" width="8" height="26" fill="#ffd23f" />
      <rect x="30" y="86" width="40" height="6" fill="#ffd23f" />
      <ellipse cx="24" cy="86" rx="7" ry="6" fill="#8a8f9c" />
      <ellipse cx="76" cy="86" rx="7" ry="6" fill="#8a8f9c" />
    </>
  );
}

function GiftBow() {
  return (
    <g>
      <path d="M50 22 L37 13 Q33 22 37 29 Z" fill="#ff5470" />
      <path d="M50 22 L63 13 Q67 22 63 29 Z" fill="#ff5470" />
      <circle cx="50" cy="22" r="4.5" fill="#e8364f" />
      <path d="M50 79 L42 72 Q41 78 44 80 Z M50 79 L58 72 Q59 78 56 80 Z" fill="#ffd23f" />
    </g>
  );
}

function Helmet() {
  return (
    <g>
      <circle cx="57" cy="35" r="25" fill="#9fd8ff" fillOpacity="0.28" stroke="#ffffff" strokeWidth="4" />
      <circle cx="57" cy="35" r="25" fill="none" stroke="#5ad1ff" strokeWidth="1.5" />
      <path d="M44 22 Q50 16 58 16" stroke="#fff" strokeWidth="3" fill="none" opacity="0.8" strokeLinecap="round" />
      <path d="M58 12 L58 4" stroke="#cfd8ea" strokeWidth="2" />
      <circle cx="58" cy="3" r="2.5" fill="#ff5470" />
    </g>
  );
}

function Simple({ id }: { id: string }) {
  switch (id) {
    case "fox":
      return (
        <>
          <circle cx="50" cy="50" r="50" fill="#fff1d6" />
          <path d="M16 20 L34 34 L22 50 Z" fill="#f47c20" />
          <path d="M84 20 L66 34 L78 50 Z" fill="#f47c20" />
          <path d="M14 34 Q50 20 86 34 Q86 66 50 88 Q14 66 14 34 Z" fill="#f47c20" />
          <path d="M22 50 Q36 52 50 88 Q64 52 78 50 Q72 72 50 88 Q28 72 22 50 Z" fill="#fff" />
          <circle cx="36" cy="48" r="4" fill="#111" />
          <circle cx="64" cy="48" r="4" fill="#111" />
          <ellipse cx="50" cy="76" rx="5" ry="4" fill="#111" />
        </>
      );
    case "bear":
      return (
        <>
          <circle cx="50" cy="50" r="50" fill="#ffe3e3" />
          <circle cx="24" cy="26" r="12" fill="#a0673a" />
          <circle cx="76" cy="26" r="12" fill="#a0673a" />
          <circle cx="24" cy="26" r="6" fill="#e2b48a" />
          <circle cx="76" cy="26" r="6" fill="#e2b48a" />
          <circle cx="50" cy="54" r="34" fill="#a0673a" />
          <ellipse cx="50" cy="66" rx="16" ry="12" fill="#e2b48a" />
          <circle cx="38" cy="48" r="4" fill="#111" />
          <circle cx="62" cy="48" r="4" fill="#111" />
          <ellipse cx="50" cy="61" rx="6" ry="4" fill="#3a2414" />
          <path d="M44 70 Q50 75 56 70" stroke="#3a2414" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </>
      );
    case "owl":
      return (
        <>
          <circle cx="50" cy="50" r="50" fill="#e7e0ff" />
          <path d="M20 22 L34 34 L22 40 Z" fill="#7a5c3e" />
          <path d="M80 22 L66 34 L78 40 Z" fill="#7a5c3e" />
          <ellipse cx="50" cy="58" rx="32" ry="34" fill="#9b7653" />
          <ellipse cx="50" cy="70" rx="18" ry="18" fill="#d9c3a5" />
          <circle cx="36" cy="46" r="12" fill="#fff" />
          <circle cx="64" cy="46" r="12" fill="#fff" />
          <circle cx="36" cy="46" r="6" fill="#111" />
          <circle cx="64" cy="46" r="6" fill="#111" />
          <path d="M46 56 L54 56 L50 64 Z" fill="#ff9f1c" />
        </>
      );
    case "bunny":
      return (
        <>
          <circle cx="50" cy="50" r="50" fill="#ffe8f3" />
          <ellipse cx="36" cy="22" rx="8" ry="20" fill="#f4f4f6" />
          <ellipse cx="64" cy="22" rx="8" ry="20" fill="#f4f4f6" />
          <ellipse cx="36" cy="22" rx="4" ry="14" fill="#ffc0d6" />
          <ellipse cx="64" cy="22" rx="4" ry="14" fill="#ffc0d6" />
          <circle cx="50" cy="60" r="30" fill="#f4f4f6" />
          <circle cx="39" cy="56" r="4" fill="#111" />
          <circle cx="61" cy="56" r="4" fill="#111" />
          <path d="M46 66 L54 66 L50 70 Z" fill="#ff7aa8" />
          <circle cx="32" cy="66" r="4" fill="#ffc0d6" opacity="0.8" />
          <circle cx="68" cy="66" r="4" fill="#ffc0d6" opacity="0.8" />
        </>
      );
    default:
      return null;
  }
}

function resolve(id: string): Parsed | null {
  if (id === "goose") return { species: "goose", bg: 1, acc: "none", fur: 0 };
  if (id === "goose-crown") return { species: "goose", bg: 1, acc: "crown", fur: 0 };
  if (id === "raccoon-party") return { species: "raccoon", bg: 0, acc: "party", fur: 0 };
  if (id === "raccoon") return { species: "raccoon", bg: 0, acc: "none", fur: 0 };
  return parseRandom(id);
}

export function Avatar({ id, size = 40, title }: { id: string; size?: number; title?: string }) {
  const p = resolve(id);
  const label = title ?? avatarLabel(id);
  let body: React.ReactNode;
  let extra: React.ReactNode = null;
  if (id === SPACE_GOOSE) {
    body = <SpaceGoose />;
    extra = <Helmet />;
  } else if (id === GIFT_RACCOON) {
    body = <GiftRaccoon />;
    extra = <GiftBow />;
  } else if (p) {
    body = (
      <>
        <circle cx="50" cy="50" r="50" fill={BGS[p.bg]} />
        {p.species === "goose" ? <GooseBody body={GOOSE_BODY[p.fur]} scarf={p.acc !== "bowtie"} /> : <RaccoonBody fur={RACCOON_FUR[p.fur]} />}
      </>
    );
    extra = <Accessory id={p.acc} species={p.species} />;
  } else {
    body = <Simple id={id} />;
  }
  // Each instance needs its own clip id when several avatars share a page.
  const clip = `av-${id.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <svg className={`avatar ${id === SPACE_GOOSE ? "legendary" : ""}`} width={size} height={size} viewBox="0 -10 100 110" role="img" aria-label={label}>
      <defs>
        <clipPath id={clip}><circle cx="50" cy="50" r="50" /></clipPath>
        {id === SPACE_GOOSE && (
          <radialGradient id="space-glow" cx="0.3" cy="0.3" r="0.8">
            <stop offset="0" stopColor="#6d4cf0" stopOpacity="0.6" />
            <stop offset="1" stopColor="#141a3d" stopOpacity="0" />
          </radialGradient>
        )}
      </defs>
      <g clipPath={`url(#${clip})`}>{body}</g>
      {extra}
      {id === SPACE_GOOSE && <circle cx="50" cy="50" r="48" fill="none" stroke="#ffd23f" strokeWidth="4" />}
    </svg>
  );
}
