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

// Run fn over items with at most `limit` in flight, keeping results in order.
export async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
