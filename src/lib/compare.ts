import "server-only";
import { all, run } from "./db";
import { bestMatches, searchStores, type Offer } from "./scrape/search";
import { confirmMatches } from "./ai";
import { formatMoney } from "./format";
import type { Item } from "./types";

export type StoredOffer = Offer & { id: number; item_id: number; ai_checked: number; checked_at: number };

// Store searches work best with the product name, not the marketing tail after a dash or comma.
export function searchQuery(title: string): string {
  const head = title.split(/\s[-|–]\s|\(/)[0].replace(/[,:;]/g, " ");
  return head.split(/\s+/).filter(Boolean).slice(0, 10).join(" ");
}

export function offersFor(itemId: number): StoredOffer[] {
  return all<StoredOffer>("SELECT * FROM offers WHERE item_id = ? ORDER BY price_cents", itemId);
}

// Look the wish up at other stores and keep the listings that look like the same product.
// With AI turned on, the model double-checks the matches (pack sizes, accessories, used items).
export async function compareItem(item: Item): Promise<StoredOffer[]> {
  const stores = (["Walmart", "Amazon"] as const).filter((st) => st.toLowerCase() !== item.store.toLowerCase());
  const found = await searchStores(searchQuery(item.title), [...stores]);
  // Other stores only: the wish's own store is covered by Check price.
  const otherStore = (o: Offer) => !item.store || o.store.toLowerCase() !== item.store.toLowerCase();
  let matches = bestMatches(searchQuery(item.title), found.filter(otherStore)).slice(0, 6);
  let aiChecked = 0;
  const details = [item.variant, item.color, item.size].filter(Boolean).join(", ");
  const verdict = await confirmMatches(item.title, details, matches.map((o) => ({ store: o.store, title: o.title, price: formatMoney(o.price_cents) })));
  if (verdict) {
    matches = matches.filter((_, i) => verdict.includes(i));
    aiChecked = 1;
  }
  // Keep the cheapest match per store.
  const perStore = new Map<string, Offer>();
  for (const o of matches) if (!perStore.has(o.store) || o.price_cents < perStore.get(o.store)!.price_cents) perStore.set(o.store, o);
  run("DELETE FROM offers WHERE item_id = ?", item.id);
  for (const o of perStore.values()) {
    run(
      "INSERT INTO offers (item_id, store, title, url, price_cents, image_url, score, ai_checked) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      item.id, o.store, o.title.slice(0, 300), o.url, o.price_cents, o.image_url, o.score ?? 0, aiChecked,
    );
  }
  run("UPDATE items SET offers_checked_at = unixepoch() WHERE id = ?", item.id);
  return offersFor(item.id);
}

export function cheaperElsewhere(item: Item, offers: StoredOffer[]): StoredOffer | undefined {
  const best = offers[0];
  if (!best || !item.price_cents) return undefined;
  return best.price_cents < item.price_cents * 0.97 ? best : undefined;
}
