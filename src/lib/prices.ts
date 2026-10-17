import "server-only";
import { all, run } from "./db";
import { fetchProduct, priceSources } from "./scrape";
import { formatMoney } from "./format";

type Row = { id: number; title: string; url: string; price_cents: number | null; currency: string; list_id: number; owner_id: number; claimed_by: number | null; list_title: string };

export function notify(userId: number, kind: string, message: string, link = "") {
  run("INSERT INTO notifications (user_id, kind, message, link) VALUES (?, ?, ?, ?)", userId, kind, message, link);
}

// Re-check prices for items with a link. A drop notifies whoever claimed it (or the owner).
export async function refreshPrices(maxItems = 40): Promise<number> {
  const hours = Number(process.env.PRICE_CHECK_HOURS ?? 24);
  const rows = all<Row>(
    `SELECT i.id, i.title, i.url, i.price_cents, i.currency, i.list_id, i.claimed_by, p.user_id AS owner_id, l.title AS list_title
     FROM items i JOIN lists l ON l.id = i.list_id JOIN profiles p ON p.id = l.profile_id
     WHERE i.url != '' AND i.purchased = 0 AND (i.price_checked_at IS NULL OR i.price_checked_at < unixepoch() - ?)
     ORDER BY i.price_checked_at IS NOT NULL, i.price_checked_at LIMIT ?`,
    hours * 3600,
    maxItems,
  );
  let checked = 0;
  for (const r of rows) {
    try {
      const info = await fetchProduct(r.url);
      let best = info.price_cents ? { price: info.price_cents, store: info.store, url: r.url } : null;
      for (const src of priceSources) {
        for (const o of await src.search(r.title).catch(() => [])) {
          if (!best || o.price_cents < best.price) best = { price: o.price_cents, store: o.store, url: o.url };
        }
      }
      if (best) {
        run("INSERT INTO price_history (item_id, price_cents, store) VALUES (?, ?, ?)", r.id, best.price, best.store);
        if (r.price_cents && best.price < r.price_cents * 0.95) {
          const msg = `Price drop: ${r.title} is now ${formatMoney(best.price, r.currency)} at ${best.store} (was ${formatMoney(r.price_cents, r.currency)})`;
          notify(r.claimed_by ?? r.owner_id, "deal", msg, `/lists/${r.list_id}#item-${r.id}`);
        }
        run("UPDATE items SET price_cents = ?, price_checked_at = unixepoch() WHERE id = ?", best.price, r.id);
      } else {
        run("UPDATE items SET price_checked_at = unixepoch() WHERE id = ?", r.id);
      }
      checked++;
    } catch {
      run("UPDATE items SET price_checked_at = unixepoch() WHERE id = ?", r.id);
    }
    await new Promise((res) => setTimeout(res, 1500)); // be polite to stores
  }
  return checked;
}
