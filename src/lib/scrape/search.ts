import "server-only";
import { decodeEntities, toCents } from "./generic";
import { fetchHtml } from "./index";

// Store search for cross-store price checks and AI idea lookups. Walmart and Amazon
// serve search pages to plain requests; Target and Kohl's put theirs behind bot walls.

export type Offer = { store: string; title: string; url: string; price_cents: number; image_url: string; score?: number };

function nextData(html: string): unknown {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  try {
    return m ? JSON.parse(m[1]) : undefined;
  } catch {
    return undefined;
  }
}

export async function searchWalmart(query: string, limit = 6): Promise<Offer[]> {
  const { html } = await fetchHtml(new URL(`https://www.walmart.com/search?q=${encodeURIComponent(query)}`));
  const data = nextData(html) as { props?: { pageProps?: { initialData?: { searchResult?: { itemStacks?: { items?: Record<string, unknown>[] }[] } } } } };
  const items = data?.props?.pageProps?.initialData?.searchResult?.itemStacks?.flatMap((s) => s.items ?? []) ?? [];
  return items
    .filter((i) => i.__typename === "Product" && !i.isSponsoredFlag && typeof i.name === "string" && i.canonicalUrl)
    .map((i) => ({
      store: "Walmart",
      title: String(i.name),
      url: new URL(String(i.canonicalUrl).split("?")[0], "https://www.walmart.com").toString(),
      price_cents: toCents(i.price) ?? 0,
      image_url: String(i.image ?? (i.imageInfo as { thumbnailUrl?: string } | undefined)?.thumbnailUrl ?? "").split("?")[0],
    }))
    .filter((o) => o.price_cents > 0)
    .slice(0, limit);
}

export async function searchAmazon(query: string, limit = 6): Promise<Offer[]> {
  const { html } = await fetchHtml(new URL(`https://www.amazon.com/s?k=${encodeURIComponent(query)}`));
  const out: Offer[] = [];
  for (const block of html.split(/data-component-type="s-search-result"/).slice(1)) {
    const head = block.slice(0, 40000);
    if (/>\s*Sponsored\s*</.test(head) || /puis-sponsored/.test(head)) continue;
    const asin = head.match(/data-asin="([A-Z0-9]{10})"/)?.[1];
    const img = head.match(/<img[^>]*class="s-image"[^>]*>/)?.[0] ?? "";
    const title = decodeEntities(img.match(/alt="([^"]+)"/)?.[1] ?? head.match(/<h2[^>]*aria-label="([^"]+)"/)?.[1] ?? "").trim();
    // The big price (data-a-size="xl") is the real one; smaller ones are per-unit or list prices.
    const price = toCents(head.match(/class="a-price"[^>]*data-a-size="xl"[^>]*><span class="a-offscreen">([^<]+)</)?.[1] ?? head.match(/class="a-offscreen">([^<]+)</)?.[1]);
    if (!asin || !title || !price) continue;
    out.push({
      store: "Amazon",
      title: title.replace(/^Sponsored Ad - /, ""),
      url: `https://www.amazon.com/dp/${asin}`,
      price_cents: price,
      image_url: img.match(/src="([^"]+)"/)?.[1] ?? "",
    });
    if (out.length >= limit) break;
  }
  return out;
}

export const SEARCHABLE = { Walmart: searchWalmart, Amazon: searchAmazon } as const;

export async function searchStores(query: string, stores: (keyof typeof SEARCHABLE)[] = ["Walmart", "Amazon"]): Promise<Offer[]> {
  const results = await Promise.all(stores.map((s) => SEARCHABLE[s](query).catch(() => [] as Offer[])));
  return results.flat();
}

// --- Matching: is a search result the same product as the wish? ---

const STOP = new Set(["the", "and", "for", "with", "set", "kit", "pack", "new", "kids", "boys", "girls", "men", "women", "adults", "ages", "gift", "toy", "toys", "of", "in", "to", "a", "an", "by", "from", "edition", "building", "home", "decor"]);

function tokens(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9.+ ]/g, " ").split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t));
}

// Model/set numbers (e.g. LEGO 10348, "WH-1000XM5") are the strongest signal.
function models(s: string): string[] {
  return (s.match(/\b(?=[a-z0-9-]*\d)[a-z0-9-]{4,}\b/gi) ?? []).map((m) => m.toLowerCase().replace(/-/g, "")).filter((m) => /\d{3,}/.test(m) || /[a-z]\d|\d[a-z]/.test(m));
}

// Pack sizes and capacities ("12 Count", "3.4 oz", "128GB") separate otherwise identical listings.
function quantities(s: string): Set<string> {
  const out = new Set<string>();
  for (const m of s.toLowerCase().matchAll(/(\d+(?:\.\d+)?)\s*-?\s*(count|ct|pack|pk|pcs?|pieces?|oz|fl\.? ?oz|ml|l|gb|tb|in|inch|lbs?|qt)\b/g)) {
    const unit = m[2].replace(/^(ct|pk|pcs?|pieces?)$/, "count").replace(/^pack$/, "count").replace(/^fl\.? ?oz$/, "oz").replace(/^inch$/, "in").replace(/^lbs$/, "lb");
    out.add(Number(m[1]) + unit);
  }
  return out;
}

export function matchScore(wish: string, candidate: string): number {
  const qw = quantities(wish), qc = quantities(candidate);
  if (qw.size && qc.size && ![...qw].some((q) => qc.has(q))) return 0.2;
  const mw = models(wish), mc = new Set(models(candidate));
  if (mw.length && mc.size) {
    if (mw.some((m) => mc.has(m))) return 0.95;
    return 0.1; // both name a model number and they differ: different product
  }
  const a = new Set(tokens(wish)), b = new Set(tokens(candidate));
  if (!a.size || !b.size) return 0;
  let hit = 0;
  for (const t of a) if (b.has(t)) hit++;
  // Store titles pad with marketing words, so compare against the shorter of the two.
  // Short wishes ("PS5") need a similarly short listing to count as a match.
  if (hit < 3) return hit / Math.max(a.size, b.size);
  return hit / Math.min(a.size, b.size);
}

export function bestMatches(wish: string, offers: Offer[], min = 0.6): Offer[] {
  return offers
    .map((o) => ({ ...o, score: matchScore(wish, o.title) }))
    .filter((o) => o.score >= min)
    .sort((x, y) => y.score! - x.score! || x.price_cents - y.price_cents);
}
