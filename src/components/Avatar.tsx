// Hand-drawn SVG avatars. Raccoon and goose are the house mascots.

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

function Raccoon({ hat }: { hat?: boolean }) {
  return (
    <>
      <circle cx="50" cy="50" r="50" fill="#cfe8ff" />
      <path d="M18 30 L28 8 L42 26 Z" fill="#6b6f7a" />
      <path d="M82 30 L72 8 L58 26 Z" fill="#6b6f7a" />
      <path d="M22 26 L28 14 L36 24 Z" fill="#2d2f36" />
      <path d="M78 26 L72 14 L64 24 Z" fill="#2d2f36" />
      <ellipse cx="50" cy="56" rx="36" ry="32" fill="#8a8f9c" />
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
      {hat && (
        <>
          <path d="M38 22 L50 -2 L62 22 Z" fill="#ff5fa2" />
          <circle cx="50" cy="-1" r="4" fill="#ffd23f" />
          <circle cx="45" cy="14" r="2" fill="#ffd23f" />
          <circle cx="55" cy="9" r="2" fill="#5ad1ff" />
        </>
      )}
    </>
  );
}

function Goose({ crown }: { crown?: boolean }) {
  return (
    <>
      <circle cx="50" cy="50" r="50" fill="#d8f5d0" />
      <ellipse cx="50" cy="92" rx="34" ry="22" fill="#fafafa" />
      <path d="M38 92 Q34 60 40 40 Q44 22 54 22 Q66 22 66 36 Q66 48 58 58 Q54 70 58 92 Z" fill="#ffffff" stroke="#e3e3e3" strokeWidth="1.5" />
      <path d="M62 34 Q80 34 86 40 Q80 46 62 44 Z" fill="#ff9f1c" />
      <path d="M63 39 L84 40" stroke="#d97706" strokeWidth="1.5" />
      <circle cx="56" cy="32" r="3.6" fill="#111" />
      <circle cx="57.2" cy="31" r="1.1" fill="#fff" />
      <path d="M50 26 Q53 23 58 25" stroke="#111" strokeWidth="2" fill="none" strokeLinecap="round" />
      <ellipse cx="46" cy="40" rx="4" ry="2.4" fill="#ffc6d9" opacity="0.8" />
      {crown ? (
        <path d="M42 22 L44 8 L50 16 L56 6 L60 16 L66 9 L64 22 Z" fill="#ffd23f" stroke="#e0a800" strokeWidth="1.5" />
      ) : (
        <path d="M40 66 Q50 72 60 66 L58 74 Q50 78 42 74 Z" fill="#4f9dff" />
      )}
    </>
  );
}

function Fox() {
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
}

function Bear() {
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
}

function Owl() {
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
}

function Bunny() {
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
}

export function Avatar({ id, size = 40, title }: { id: string; size?: number; title?: string }) {
  let body;
  switch (id) {
    case "goose": body = <Goose />; break;
    case "goose-crown": body = <Goose crown />; break;
    case "raccoon-party": body = <Raccoon hat />; break;
    case "fox": body = <Fox />; break;
    case "bear": body = <Bear />; break;
    case "owl": body = <Owl />; break;
    case "bunny": body = <Bunny />; break;
    default: body = <Raccoon />;
  }
  return (
    <svg className="avatar" width={size} height={size} viewBox="0 -6 100 106" role="img" aria-label={title ?? id}>
      <defs>
        <clipPath id="avatar-clip">
          <circle cx="50" cy="50" r="50" />
          <rect x="34" y="-6" width="32" height="30" />
        </clipPath>
      </defs>
      <g clipPath="url(#avatar-clip)">{body}</g>
    </svg>
  );
}
