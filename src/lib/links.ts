// Pull product links out of shared or pasted text ("Look at this! https://...").

export function extractUrls(text: string, max = 50): string[] {
  const out: string[] = [];
  for (const raw of text.match(/https?:\/\/[^\s<>"'`]+/gi) ?? []) {
    const trimmed = raw.replace(/[)\].,;:!?]+$/, "");
    let u: URL;
    try {
      u = new URL(trimmed);
    } catch {
      continue;
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") continue;
    const s = u.toString();
    if (!out.includes(s)) out.push(s);
    if (out.length >= max) break;
  }
  return out;
}
