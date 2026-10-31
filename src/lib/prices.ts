import "server-only";
import { all, get, run } from "./db";
import { fetchProduct } from "./scrape";
import { cheaperElsewhere, compareItem } from "./compare";
import { formatMoney } from "./format";
import { checkWatches } from "./watches";
import type { Item } from "./types";

type Row = Item & { owner_id: number; is_primary: number; list_title: string };

const short = (t: string) => (t.length > 60 ? t.slice(0, 57).trimEnd() + "…" : t);

export function notify(userId: number, kind: string, message: string, link = "") {
  run("INSERT INTO notifications (user_id, kind, message, link) VALUES (?, ?, ?, ?)", userId, kind, message, link);
}

// Who hears about deals: whoever claimed the gift, otherwise the list's managers
// (an unclaimed price drop tells the recipient nothing about who is buying what).
function dealWatchers(r: Row): number[] {
  if (r.claimed_by) return [r.claimed_by];
  const co = all<{ user_id: number }>("SELECT user_id FROM list_owners WHERE list_id = ?", r.list_id).map((x) => x.user_id);
  return [r.owner_id, ...co.filter((id) => id !== r.owner_id)];
}

// Background sweep: re-check each linked item's own price, and look for the same item
// cheaper at other stores. Drops of 5% (same link) or 10% (another store) send an alert.
export async function refreshPrices(maxItems = 30): Promise<number> {
  const hours = Number(process.env.PRICE_CHECK_HOURS ?? 24);
  const compare = (process.env.COMPARE_STORES ?? "true") !== "false";
  const rows = all<Row>(
    `SELECT i.*, p.user_id AS owner_id, p.is_primary, l.title AS list_title
     FROM items i JOIN lists l ON l.id = i.list_id JOIN profiles p ON p.id = l.profile_id
     WHERE i.purchased = 0 AND i.archived_at IS NULL AND (i.price_checked_at IS NULL OR i.price_checked_at < unixepoch() - ?)
     ORDER BY i.price_checked_at IS NOT NULL, i.price_checked_at LIMIT ?`,
    hours * 3600,
    maxItems,
  );
  let checked = 0;
  for (const r of rows) {
    const link = `/lists/${r.list_id}#item-${r.id}`;
    try {
      if (r.url) {
        const info = await fetchProduct(r.url);
        if (info.price_cents) {
          run("INSERT INTO price_history (item_id, price_cents, store) VALUES (?, ?, ?)", r.id, info.price_cents, info.store);
          if (r.price_cents && info.price_cents <= r.price_cents * 0.95) {
            for (const uid of dealWatchers(r)) {
              notify(uid, "deal", `Price drop: ${short(r.title)} is now ${formatMoney(info.price_cents)} at ${info.store} (was ${formatMoney(r.price_cents)})`, link);
            }
          }
          run("UPDATE items SET price_cents = ? WHERE id = ?", info.price_cents, r.id);
          checkWatches(r.id, info.price_cents);
        }
      }
      if (compare) {
        const before = get<{ p: number | null }>("SELECT MIN(price_cents) AS p FROM offers WHERE item_id = ?", r.id)?.p ?? null;
        const current = get<Item>("SELECT * FROM items WHERE id = ?", r.id)!;
        const offers = await compareItem(current);
        const deal = cheaperElsewhere(current, offers);
        if (deal && current.price_cents && deal.price_cents <= current.price_cents * 0.9 && (before === null || deal.price_cents < before)) {
          for (const uid of dealWatchers(r)) {
            notify(uid, "deal", `Cheaper elsewhere: ${short(r.title)} is ${formatMoney(deal.price_cents)} at ${deal.store} (vs ${formatMoney(current.price_cents)})`, link);
          }
        }
      }
      checked++;
    } catch {
      /* store hiccup; try again next sweep */
    }
    run("UPDATE items SET price_checked_at = unixepoch() WHERE id = ?", r.id);
    await new Promise((res) => setTimeout(res, 2000)); // be polite to stores
  }
  return checked;
}
