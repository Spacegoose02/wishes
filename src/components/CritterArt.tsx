// Drawings for the critter avatars, Baxter and the logo. Everything is drawn on a
// 100 x 100 grid (the avatar circle), with hats allowed to poke up to y = -10.
// One shared look: soft gradients, a warm dark outline, glossy eyes and rosy cheeks.

export const INK = "#2a2230";
const W = 2.2; // main outline
const W2 = 1.5; // inner detail lines

export type Fur = { base: string; light: string; dark: string };

export const RACCOON_PALETTES: Fur[] = [
  { base: "#9ba0ad", light: "#d3d6de", dark: "#5f6472" }, // classic grey
  { base: "#a98262", light: "#dcbfa3", dark: "#6c4b34" }, // cocoa
  { base: "#93a4cc", light: "#cdd8f0", dark: "#5a6993" }, // blueberry
  { base: "#b79dce", light: "#e2d3f0", dark: "#7a6196" }, // lilac
];

export const GOOSE_PALETTES: Fur[] = [
  { base: "#ffffff", light: "#ffffff", dark: "#d5dae4" }, // snow
  { base: "#f8ecd0", light: "#fff8e8", dark: "#dcc89c" }, // cream
  { base: "#dadde3", light: "#f1f2f5", dark: "#a9afbb" }, // storm
  { base: "#ffdcea", light: "#fff1f7", dark: "#efb0c9" }, // bubblegum
];

export function mix(a: string, b: string, t: number): string {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
}

/** Gradients every drawing can use, namespaced by `u` so many avatars can share a page. */
export function SharedDefs({ u, fur, bg }: { u: string; fur?: Fur; bg?: string }) {
  return (
    <>
      {bg && (
        <radialGradient id={`${u}bg`} cx="0.5" cy="0.32" r="0.75">
          <stop offset="0" stopColor={mix(bg, "#ffffff", 0.65)} />
          <stop offset="0.7" stopColor={bg} />
          <stop offset="1" stopColor={mix(bg, "#5a4a6a", 0.12)} />
        </radialGradient>
      )}
      {fur && (
        <>
          <radialGradient id={`${u}fur`} cx="0.42" cy="0.25" r="0.85">
            <stop offset="0" stopColor={fur.light} />
            <stop offset="0.55" stopColor={fur.base} />
            <stop offset="1" stopColor={fur.dark} />
          </radialGradient>
          <linearGradient id={`${u}furv`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={fur.base} />
            <stop offset="1" stopColor={fur.dark} />
          </linearGradient>
        </>
      )}
      <linearGradient id={`${u}white`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset="1" stopColor="#e6e3ec" />
      </linearGradient>
      <radialGradient id={`${u}mask`} cx="0.5" cy="0.35" r="0.7">
        <stop offset="0" stopColor="#4a4352" />
        <stop offset="1" stopColor="#241e2a" />
      </radialGradient>
      <radialGradient id={`${u}iris`} cx="0.4" cy="0.35" r="0.7">
        <stop offset="0" stopColor="#a8693a" />
        <stop offset="0.6" stopColor="#6b3d1e" />
        <stop offset="1" stopColor="#3a1f0e" />
      </radialGradient>
      <radialGradient id={`${u}bead`} cx="0.4" cy="0.3" r="0.75">
        <stop offset="0" stopColor="#4b3f55" />
        <stop offset="1" stopColor="#140f18" />
      </radialGradient>
      <linearGradient id={`${u}gold`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffe680" />
        <stop offset="0.55" stopColor="#ffc928" />
        <stop offset="1" stopColor="#e89a00" />
      </linearGradient>
      <linearGradient id={`${u}beak`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffbf55" />
        <stop offset="1" stopColor="#f28a12" />
      </linearGradient>
      <linearGradient id={`${u}tongue`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ff8f9e" />
        <stop offset="1" stopColor="#f2607a" />
      </linearGradient>
    </>
  );
}

/** The round backdrop with a soft floor shadow. */
export function Backdrop({ u }: { u: string }) {
  return (
    <>
      <circle cx="50" cy="50" r="50" fill={`url(#${u}bg)`} />
      <ellipse cx="50" cy="104" rx="44" ry="14" fill="#3a2a4a" opacity="0.08" />
    </>
  );
}

/** A glossy bead eye. */
export function BeadEye({ u, cx, cy, r = 4.6, look = 0.6 }: { u: string; cx: number; cy: number; r?: number; look?: number }) {
  return (
    <g>
      <ellipse cx={cx} cy={cy} rx={r} ry={r * 1.12} fill={`url(#${u}bead)`} />
      <circle cx={cx + r * 0.32 * look + r * 0.1} cy={cy - r * 0.42} r={r * 0.4} fill="#fff" />
      <circle cx={cx - r * 0.38} cy={cy + r * 0.45} r={r * 0.18} fill="#fff" opacity="0.85" />
    </g>
  );
}

/** Baxter's big brown eye: white, iris, pupil and two sparkles. */
export function BigEye({ u, cx, cy, r = 7 }: { u: string; cx: number; cy: number; r?: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#fff" stroke={INK} strokeWidth={W2} />
      <circle cx={cx + r * 0.08} cy={cy + r * 0.06} r={r * 0.78} fill={`url(#${u}iris)`} />
      <circle cx={cx + r * 0.1} cy={cy + r * 0.1} r={r * 0.4} fill="#160c10" />
      <circle cx={cx + r * 0.34} cy={cy - r * 0.32} r={r * 0.3} fill="#fff" />
      <circle cx={cx - r * 0.3} cy={cy + r * 0.4} r={r * 0.13} fill="#fff" opacity="0.9" />
    </g>
  );
}

export function Blush({ cx, cy, rx = 4.6, ry = 2.6 }: { cx: number; cy: number; rx?: number; ry?: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#ff8fa6" opacity="0.45" />;
}

/** An open, happy mouth with a tongue, centred under (x, y). */
export function HappyMouth({ u, x, y, w = 8, h = 7 }: { u: string; x: number; y: number; w?: number; h?: number }) {
  return (
    <g>
      <path
        d={`M${x - w} ${y} Q${x} ${y + 2} ${x + w} ${y} C${x + w - 1} ${y + h} ${x - w + 1} ${y + h} ${x - w} ${y} Z`}
        fill="#5b1e2c" stroke={INK} strokeWidth={W2} strokeLinejoin="round"
      />
      <path
        d={`M${x - w * 0.55} ${y + h * 0.62} C${x - w * 0.3} ${y + h * 0.2} ${x + w * 0.3} ${y + h * 0.2} ${x + w * 0.55} ${y + h * 0.62} C${x + w * 0.3} ${y + h * 0.86} ${x - w * 0.3} ${y + h * 0.86} ${x - w * 0.55} ${y + h * 0.62} Z`}
        fill={`url(#${u}tongue)`}
      />
    </g>
  );
}

/* ---------------------------------------------------------------- raccoon */

export function RaccoonBust({ u, body = true, mouth = "open" }: { u: string; body?: boolean; mouth?: "open" | "smile" }) {
  const fur = `url(#${u}fur)`;
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      {body && (
        <>
          <path d="M10 108 C12 90 28 80 50 80 C72 80 88 90 90 108 Z" fill={`url(#${u}furv)`} stroke={INK} strokeWidth={W} />
          <path d="M36 108 C37 94 43 88 50 88 C57 88 63 94 64 108 Z" fill={`url(#${u}white)`} stroke={INK} strokeWidth={W2} />
        </>
      )}
      {/* ears */}
      <path d="M17 42 C12 26 16 12 24 9 C32 8 40 18 43 26 Z" fill={fur} stroke={INK} strokeWidth={W} />
      <path d="M83 42 C88 26 84 12 76 9 C68 8 60 18 57 26 Z" fill={fur} stroke={INK} strokeWidth={W} />
      <path d="M21 36 C19 26 21 17 25 15 C30 15 35 22 37 28 Z" fill="#3a3340" />
      <path d="M79 36 C81 26 79 17 75 15 C70 15 65 22 63 28 Z" fill="#3a3340" />
      <path d="M23 33 L26 22 L28 30 L31 24 L32 31" fill="none" stroke="#f3f0f6" strokeWidth="1.6" />
      <path d="M77 33 L74 22 L72 30 L69 24 L68 31" fill="none" stroke="#f3f0f6" strokeWidth="1.6" />
      {/* head with fluffy cheeks */}
      <path
        d="M50 20 C68 20 82 29 85 44 L92 51 L86 54 L92 61 L84 63 C78 78 65 86 50 86 C35 86 22 78 16 63 L8 61 L14 54 L8 51 L15 44 C18 29 32 20 50 20 Z"
        fill={fur} stroke={INK} strokeWidth={W}
      />
      {/* forehead stripe */}
      <path d="M50 22 C45.5 27 45 36 47 46 L53 46 C55 36 54.5 27 50 22 Z" fill={`url(#${u}furv)`} opacity="0.75" />
      {/* white cheeks and muzzle */}
      <path
        d="M14 58 C22 60 30 63 38 63 C44 63 47 60 50 60 C53 60 56 63 62 63 C70 63 78 60 86 58 L84 63 C78 78 65 86 50 86 C35 86 22 78 16 63 Z"
        fill={`url(#${u}white)`}
      />
      <path d="M8 61 L16 63 C22 78 35 86 50 86 C65 86 78 78 84 63 L92 61" fill="none" stroke={INK} strokeWidth={W} />
      {/* white brows */}
      <path d="M19 46 C21 37 33 32 44 37 C44 41 41 43 38 43 C31 42 25 43 19 46 Z" fill="#fbfafc" opacity="0.92" />
      <path d="M81 46 C79 37 67 32 56 37 C56 41 59 43 62 43 C69 42 75 43 81 46 Z" fill="#fbfafc" opacity="0.92" />
      {/* bandit mask */}
      <path d="M12 52 C17 44 28 41 38 44 C45 46 48 50 47 55 C45.5 62 38 65 30 64 C22 63 16 58 12 52 Z" fill={`url(#${u}mask)`} />
      <path d="M88 52 C83 44 72 41 62 44 C55 46 52 50 53 55 C54.5 62 62 65 70 64 C78 63 84 58 88 52 Z" fill={`url(#${u}mask)`} />
      <BigEye u={u} cx={34} cy={52.5} r={7.4} />
      <BigEye u={u} cx={66} cy={52.5} r={7.4} />
      {/* muzzle */}
      <ellipse cx="50" cy="68" rx="12.5" ry="9.5" fill={`url(#${u}white)`} stroke={INK} strokeWidth={W2} />
      <path d="M44.2 61.6 C44.2 58.4 55.8 58.4 55.8 61.6 C55.8 64.6 52.4 67 50 67 C47.6 67 44.2 64.6 44.2 61.6 Z" fill="#1d1722" stroke={INK} strokeWidth="1" />
      <ellipse cx="48" cy="60.6" rx="2.6" ry="1.1" fill="#fff" opacity="0.75" />
      <path d="M50 67 L50 69.5" stroke={INK} strokeWidth={W2} />
      {mouth === "open" ? (
        <HappyMouth u={u} x={50} y={69.5} w={7.5} h={7.5} />
      ) : (
        <path d="M43.5 69.5 Q47 73 50 69.5 Q53 73 56.5 69.5" fill="none" stroke={INK} strokeWidth={W2} />
      )}
      <Blush cx={22} cy={67} />
      <Blush cx={78} cy={67} />
    </g>
  );
}

/* ---------------------------------------------------------------- goose */

export function GooseBust({ u, scarf = true }: { u: string; scarf?: boolean }) {
  const fur = `url(#${u}fur)`;
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <ellipse cx="50" cy="106" rx="42" ry="24" fill={`url(#${u}furv)`} stroke={INK} strokeWidth={W} />
      <path d="M14 104 C20 92 32 88 40 92" fill="none" stroke={INK} strokeWidth={W2} opacity="0.45" />
      {/* neck, chest and head in one stroke */}
      <path
        d="M28 108 C28 94 36 84 40 74 C42 66 36 58 36 44 C36 28 46 19 57 19 C69 19 77 28 77 39 C77 49 70 55 67 61 C64 68 68 76 74 83 C80 90 80 100 78 108 Z"
        fill={fur} stroke={INK} strokeWidth={W}
      />
      <path d="M44 92 C50 96 58 96 64 92 M48 100 C54 103 60 103 66 100" fill="none" stroke={INK} strokeWidth="1.2" opacity="0.3" />
      {/* little head tuft */}
      <path d="M54 19.5 C53 14.5 56.5 11.5 60 12.5 C58 14.5 58 17 59 19.5" fill={fur} stroke={INK} strokeWidth={W2} />
      {/* beak */}
      <path d="M72 35 C79 32.5 89 34.5 93 39.5 C89 43.5 79 44.5 73 42.5 Z" fill={`url(#${u}beak)`} stroke={INK} strokeWidth={W2} />
      <path d="M73 42.5 C80 44.5 87 43.5 91 41.5 C88 47.5 79 49.5 72.5 47 Z" fill="#e8780c" stroke={INK} strokeWidth={W2} />
      <circle cx="80" cy="37" r="0.9" fill={INK} opacity="0.6" />
      <BeadEye u={u} cx={62} cy={33} r={4.6} />
      <path d="M56 25.5 Q60.5 22.5 66 24.5" fill="none" stroke={INK} strokeWidth={W2} />
      <Blush cx={62} cy={44} rx={4.6} ry={2.5} />
      {scarf && (
        <g>
          <path d="M34 63 C43 69 57 69 69 61 L71 70 C59 78 43 78 33 72 Z" fill="#4f9dff" stroke={INK} strokeWidth={W2} />
          <path d="M41 67.5 L40.5 75.5 M49 68.8 L49 76.8 M57 68.2 L58 76" stroke="#ffd23f" strokeWidth="2.4" />
          <path d="M40 72 L34 92 L43 93.5 L47 74 Z" fill="#3c86ea" stroke={INK} strokeWidth={W2} />
          <path d="M38.5 81 L36.5 88" stroke="#ffd23f" strokeWidth="2.2" />
        </g>
      )}
    </g>
  );
}

/* ---------------------------------------------------------------- the rest of the gang */

export function FoxBust({ u }: { u: string }) {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <path d="M12 108 C14 90 30 82 50 82 C70 82 86 90 88 108 Z" fill={`url(#${u}furv)`} stroke={INK} strokeWidth={W} />
      <path d="M38 108 C39 96 44 89 50 89 C56 89 61 96 62 108 Z" fill={`url(#${u}white)`} stroke={INK} strokeWidth={W2} />
      <path d="M16 46 C12 30 14 14 20 8 C28 10 40 20 44 28 Z" fill={`url(#${u}fur)`} stroke={INK} strokeWidth={W} />
      <path d="M84 46 C88 30 86 14 80 8 C72 10 60 20 56 28 Z" fill={`url(#${u}fur)`} stroke={INK} strokeWidth={W} />
      <path d="M20 38 C18 28 19 18 22 13 C27 16 34 22 37 28 Z" fill="#fff3e8" />
      <path d="M80 38 C82 28 81 18 78 13 C73 16 66 22 63 28 Z" fill="#fff3e8" />
      <path d="M20 8 C18 12 17 16 17.5 20 L24 13 Z M80 8 C82 12 83 16 82.5 20 L76 13 Z" fill="#3a2a2a" />
      <path
        d="M50 22 C68 22 84 32 86 48 C88 60 82 66 76 72 C68 80 58 86 50 86 C42 86 32 80 24 72 C18 66 12 60 14 48 C16 32 32 22 50 22 Z"
        fill={`url(#${u}fur)`} stroke={INK} strokeWidth={W}
      />
      <path d="M15 54 C24 54 36 58 44 66 C47 69 48.5 72 50 72 C51.5 72 53 69 56 66 C64 58 76 54 85 54 C84 62 80 68 76 72 C68 80 58 86 50 86 C42 86 32 80 24 72 C20 68 16 62 15 54 Z" fill={`url(#${u}white)`} />
      <path d="M24 72 C32 80 42 86 50 86 C58 86 68 80 76 72" fill="none" stroke={INK} strokeWidth={W} />
      <BeadEye u={u} cx={35} cy={50} r={5} />
      <BeadEye u={u} cx={65} cy={50} r={5} />
      <path d="M28 41 Q34 38 40 41 M60 41 Q66 38 72 41" fill="none" stroke={INK} strokeWidth={W2} />
      <path d="M45 66 C45 63 55 63 55 66 C55 68.5 52 70.5 50 70.5 C48 70.5 45 68.5 45 66 Z" fill="#1d1722" />
      <ellipse cx="48.4" cy="65" rx="2" ry="0.9" fill="#fff" opacity="0.7" />
      <path d="M50 70.5 L50 73 M44.5 73 Q47.5 76.5 50 73 Q52.5 76.5 55.5 73" fill="none" stroke={INK} strokeWidth={W2} />
      <Blush cx={25} cy={62} />
      <Blush cx={75} cy={62} />
    </g>
  );
}

export function BearBust({ u }: { u: string }) {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <path d="M10 108 C12 90 28 80 50 80 C72 80 88 90 90 108 Z" fill={`url(#${u}furv)`} stroke={INK} strokeWidth={W} />
      <circle cx="22" cy="26" r="12" fill={`url(#${u}fur)`} stroke={INK} strokeWidth={W} />
      <circle cx="78" cy="26" r="12" fill={`url(#${u}fur)`} stroke={INK} strokeWidth={W} />
      <circle cx="22.5" cy="27" r="6.5" fill="#e9c39c" />
      <circle cx="77.5" cy="27" r="6.5" fill="#e9c39c" />
      <ellipse cx="50" cy="54" rx="36" ry="33" fill={`url(#${u}fur)`} stroke={INK} strokeWidth={W} />
      <ellipse cx="50" cy="68" rx="15" ry="11.5" fill="#f1d3b0" stroke={INK} strokeWidth={W2} />
      <BeadEye u={u} cx={36} cy={51} r={4.8} />
      <BeadEye u={u} cx={64} cy={51} r={4.8} />
      <path d="M44 62 C44 58.6 56 58.6 56 62 C56 65 52.5 67 50 67 C47.5 67 44 65 44 62 Z" fill="#2a1a14" />
      <ellipse cx="48" cy="60.8" rx="2.3" ry="1" fill="#fff" opacity="0.7" />
      <path d="M50 67 L50 69.5" stroke={INK} strokeWidth={W2} />
      <HappyMouth u={u} x={50} y={69.5} w={6} h={6} />
      <Blush cx={26} cy={63} />
      <Blush cx={74} cy={63} />
    </g>
  );
}

export function OwlBust({ u }: { u: string }) {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <path d="M16 30 C14 20 16 12 20 8 C26 12 32 20 36 28 Z" fill={`url(#${u}furv)`} stroke={INK} strokeWidth={W} />
      <path d="M84 30 C86 20 84 12 80 8 C74 12 68 20 64 28 Z" fill={`url(#${u}furv)`} stroke={INK} strokeWidth={W} />
      <path d="M50 20 C74 20 86 36 86 60 C86 86 70 104 50 104 C30 104 14 86 14 60 C14 36 26 20 50 20 Z" fill={`url(#${u}fur)`} stroke={INK} strokeWidth={W} />
      <path d="M50 64 C64 64 72 76 72 90 C72 100 62 106 50 106 C38 106 28 100 28 90 C28 76 36 64 50 64 Z" fill="#f2e2c8" stroke={INK} strokeWidth={W2} />
      <path d="M40 78 q3 3 6 0 q3 3 6 0 q3 3 6 0 M36 86 q3 3 6 0 q3 3 6 0 q3 3 6 0 q3 3 6 0 M40 94 q3 3 6 0 q3 3 6 0 q3 3 6 0" fill="none" stroke="#c9a77c" strokeWidth="1.6" />
      <path d="M14 66 C8 74 10 88 20 96 C22 86 22 76 20 68 Z M86 66 C92 74 90 88 80 96 C78 86 78 76 80 68 Z" fill={`url(#${u}furv)`} stroke={INK} strokeWidth={W2} />
      <path d="M50 30 C42 30 34 34 30 40 C24 40 18 46 18 52 C18 60 26 64 34 63 C40 63 46 60 50 56 C54 60 60 63 66 63 C74 64 82 60 82 52 C82 46 76 40 70 40 C66 34 58 30 50 30 Z" fill="#fbf3e4" stroke={INK} strokeWidth={W2} />
      <circle cx="34" cy="50" r="10" fill="#ffb02e" stroke={INK} strokeWidth={W2} />
      <circle cx="66" cy="50" r="10" fill="#ffb02e" stroke={INK} strokeWidth={W2} />
      <BeadEye u={u} cx={34.5} cy={50.5} r={6} />
      <BeadEye u={u} cx={65.5} cy={50.5} r={6} />
      <path d="M45.5 56 L54.5 56 L50 65 Z" fill={`url(#${u}beak)`} stroke={INK} strokeWidth={W2} />
      <Blush cx={24} cy={62} rx={4} ry={2.2} />
      <Blush cx={76} cy={62} rx={4} ry={2.2} />
    </g>
  );
}

export function BunnyBust({ u }: { u: string }) {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <path d="M12 108 C14 90 30 82 50 82 C70 82 86 90 88 108 Z" fill={`url(#${u}furv)`} stroke={INK} strokeWidth={W} />
      <path d="M30 40 C22 26 22 4 30 -4 C38 0 42 22 42 36 Z" fill={`url(#${u}fur)`} stroke={INK} strokeWidth={W} />
      <path d="M70 40 C78 26 80 4 72 -4 C64 0 58 22 58 36 Z" fill={`url(#${u}fur)`} stroke={INK} strokeWidth={W} />
      <path d="M32 34 C27 24 27 8 31 2 C35 6 38 20 38 32 Z" fill="#ffc3d6" />
      <path d="M68 34 C73 24 74 8 70 2 C66 6 62 20 62 32 Z" fill="#ffc3d6" />
      <ellipse cx="50" cy="60" rx="32" ry="27" fill={`url(#${u}fur)`} stroke={INK} strokeWidth={W} />
      <BeadEye u={u} cx={37} cy={56} r={4.8} />
      <BeadEye u={u} cx={63} cy={56} r={4.8} />
      <path d="M46.5 64 L53.5 64 Q50 68.5 46.5 64 Z" fill="#ff7aa3" stroke={INK} strokeWidth="1.2" />
      <path d="M50 67 L50 69 M45 69 Q47.5 72.5 50 69 Q52.5 72.5 55 69" fill="none" stroke={INK} strokeWidth={W2} />
      <rect x="47.2" y="70.6" width="5.6" height="5" rx="1.4" fill="#fff" stroke={INK} strokeWidth="1.2" />
      <path d="M50 70.8 L50 75.4" stroke={INK} strokeWidth="0.9" />
      <Blush cx={29} cy={67} />
      <Blush cx={71} cy={67} />
      <path d="M22 64 L12 62 M22 68 L12 70 M78 64 L88 62 M78 68 L88 70" stroke={INK} strokeWidth="1" opacity="0.5" />
    </g>
  );
}

/* ---------------------------------------------------------------- party hat (Baxter's signature) */

export function PartyHat({ u, x, top, tilt = -10, scale = 1 }: { u: string; x: number; top: number; tilt?: number; scale?: number }) {
  const dots: [number, number, string][] = [
    [-6, -4, "#4f9dff"], [5, -6, "#ff5470"], [-1, -13, "#3ccf6e"], [-7, -10, "#ffd23f"],
    [4, -17, "#a66bff"], [7, 0, "#ffd23f"], [-2, 0, "#ff5470"], [1, -22, "#4f9dff"],
  ];
  return (
    <g transform={`translate(${x} ${top}) rotate(${tilt}) scale(${scale})`} strokeLinejoin="round" strokeLinecap="round">
      <defs>
        <clipPath id={`${u}cone`}><path d="M-13 2 L0 -28 L13 2 Z" /></clipPath>
        <linearGradient id={`${u}conef`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5fd3ff" />
          <stop offset="1" stopColor="#2b9be8" />
        </linearGradient>
      </defs>
      <path d="M-13 2 L0 -28 L13 2 Z" fill={`url(#${u}conef)`} />
      <g clipPath={`url(#${u}cone)`}>
        {dots.map(([dx, dy, c], i) => <circle key={i} cx={dx} cy={dy} r="2.3" fill={c} />)}
        <path d="M-13 2 L0 -28 L-3 2 Z" fill="#fff" opacity="0.18" />
      </g>
      <path d="M-13 2 L0 -28 L13 2" fill="none" stroke={INK} strokeWidth={W} />
      <path d="M-14.5 1 Q0 6 14.5 1 L14 4.5 Q0 9.5 -14 4.5 Z" fill="#ffd23f" stroke={INK} strokeWidth={W2} />
      <g transform="translate(0 -29)">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((r) => (
          <ellipse key={r} cx="0" cy="-3.6" rx="2.2" ry="3.8" fill="#ffd23f" stroke="#e8a400" strokeWidth="0.8" transform={`rotate(${r})`} />
        ))}
        <circle r="3" fill="#ffe680" />
      </g>
    </g>
  );
}

/* ---------------------------------------------------------------- the Wishes logo */

/** Baxter peeking over his wish list, paws on the scroll, tail curling round. Drawn on 0 0 120 130. */
const TAIL = "M70 108 C92 114 108 100 106 82 C105 72 100 66 94 64";

export function LogoArt({ u }: { u: string }) {
  const fur = `url(#${u}fur)`;
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <defs>
        <SharedDefs u={u} fur={RACCOON_PALETTES[0]} />
        <linearGradient id={`${u}paper`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fffaf0" />
          <stop offset="1" stopColor="#fbe7bf" />
        </linearGradient>
        <linearGradient id={`${u}roll`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbe3b0" />
          <stop offset="1" stopColor="#e9bf72" />
        </linearGradient>
      </defs>
      {/* striped tail */}
      <path d={TAIL} fill="none" stroke={INK} strokeWidth="25" />
      <path d={TAIL} fill="none" stroke={fur} strokeWidth="20.5" />
      <path d={TAIL} fill="none" stroke="#2f2936" strokeWidth="20.5" strokeDasharray="8 8" strokeDashoffset="4" strokeLinecap="butt" />
      <path d="M80 104 C95 106 103 96 102 84" fill="none" stroke="#fff" strokeWidth="2.4" opacity="0.25" />
      {/* body behind the scroll */}
      <path d="M26 126 C24 104 32 88 50 86 L70 86 C88 88 96 104 94 126 Z" fill={`url(#${u}furv)`} stroke={INK} strokeWidth="2.4" />
      {/* the wish list */}
      <g transform="rotate(-5 60 100)">
        <path d="M34 80 L86 80 L86 124 L34 124 Z" fill={`url(#${u}paper)`} stroke={INK} strokeWidth="2.2" />
        <rect x="30" y="74" width="60" height="9" rx="4.5" fill={`url(#${u}roll)`} stroke={INK} strokeWidth="2.2" />
        <rect x="30" y="120" width="60" height="9" rx="4.5" fill={`url(#${u}roll)`} stroke={INK} strokeWidth="2.2" />
        <rect x="42" y="87.5" width="36" height="6" rx="3" fill="#ff7a59" />
        {[98, 107, 116].map((y, i) => (
          <g key={y}>
            <rect x="41" y={y - 3.2} width="6.4" height="6.4" rx="1.8" fill="#fff" stroke={INK} strokeWidth="1.4" />
            {i < 2 && <path d={`M42.4 ${y} L44 ${y + 1.8} L47.6 ${y - 2.6}`} fill="none" stroke="#18a058" strokeWidth="1.8" />}
            <path d={`M51 ${y} L${i === 1 ? 72 : 78} ${y}`} stroke="#c9b48a" strokeWidth="2.2" />
          </g>
        ))}
      </g>
      {/* paws gripping the scroll */}
      <ellipse cx="30" cy="96" rx="6.5" ry="8" fill="#3a3340" stroke={INK} strokeWidth="2" transform="rotate(-10 30 96)" />
      <ellipse cx="88" cy="92" rx="6.5" ry="8" fill="#3a3340" stroke={INK} strokeWidth="2" transform="rotate(10 88 92)" />
      <path d="M27 93 L32 92 M27.5 98 L33 97 M85 89 L90.5 89.5 M85.5 94 L91 94.5" stroke="#6f6878" strokeWidth="1.2" />
      {/* head */}
      <g transform="translate(10 -6)">
        <RaccoonBust u={u} body={false} />
        <PartyHat u={u} x={58} top={22} tilt={14} />
      </g>
      {/* sparkles */}
      <path d="M8 30 Q8 36 14 36 Q8 36 8 42 Q8 36 2 36 Q8 36 8 30 Z" fill="#ffc928" stroke={INK} strokeWidth="1" />
      <path d="M110 22 Q110 26 114 26 Q110 26 110 30 Q110 26 106 26 Q110 26 110 22 Z" fill="#ff7a59" stroke={INK} strokeWidth="0.9" />
      <circle cx="104" cy="42" r="1.8" fill="#4f9dff" />
    </g>
  );
}
