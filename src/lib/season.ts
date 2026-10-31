// Seasonal flavor for celebrations (shared by server and client code).

export type Season = { name: string; pieces: string[] };

export function seasonFor(d: Date = new Date()): Season {
  const m = d.getMonth();
  const day = d.getDate();
  if (m === 11 || (m === 0 && day <= 6)) return { name: "winter holidays", pieces: ["❄️", "⛄", "🎄", "✨"] };
  if (m === 9) return { name: "fall", pieces: ["🎃", "🍂", "🍁", "🦇"] };
  if (m === 10) return { name: "harvest", pieces: ["🍂", "🍁", "🥧", "🌰"] };
  if (m === 1 && day <= 15) return { name: "valentines", pieces: ["❤️", "💕", "💖", "🌹"] };
  if (m >= 2 && m <= 4) return { name: "spring", pieces: ["🌸", "🌷", "🐣", "🌼"] };
  if (m >= 5 && m <= 7) return { name: "summer", pieces: ["☀️", "🌊", "🍉", "🕶️"] };
  return { name: "party", pieces: ["🎉", "✨", "🎈", "⭐"] };
}

// The big day gets cake and balloons on top of the season.
export function celebrationPieces(kind: "wish" | "event", d: Date = new Date()): string[] {
  const s = seasonFor(d).pieces;
  return kind === "event" ? ["🎂", "🎈", "🎁", ...s] : ["✨", "⭐", ...s];
}
