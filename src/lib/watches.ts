import "server-only";
import { all, get, run } from "./db";
import { formatMoney } from "./format";
import { notify } from "./prices";

// Price-drop watchlist: anyone who can see a wish can ask to hear when it reaches their
// target price. Watches are private to the person who set them.

export function watchesFor(userId: number, listId: number): Map<number, number> {
  return new Map(
    all<{ item_id: number; target_cents: number }>(
      "SELECT w.item_id, w.target_cents FROM price_watches w JOIN items i ON i.id = w.item_id WHERE w.user_id = ? AND i.list_id = ?",
      userId, listId,
    ).map((w) => [w.item_id, w.target_cents]),
  );
}

// Set a target (re-arming the alert), or clear it with null.
export function setWatch(userId: number, itemId: number, targetCents: number | null) {
  if (!targetCents) {
    run("DELETE FROM price_watches WHERE user_id = ? AND item_id = ?", userId, itemId);
    return;
  }
  run(
    `INSERT INTO price_watches (user_id, item_id, target_cents) VALUES (?, ?, ?)
     ON CONFLICT(user_id, item_id) DO UPDATE SET target_cents = excluded.target_cents, notified_at = NULL`,
    userId, itemId, targetCents,
  );
}

// After a new price is seen: tell each watcher whose target it meets, once per target.
export function checkWatches(itemId: number, priceCents: number): number[] {
  const item = get<{ title: string; list_id: number; purchased: number }>("SELECT title, list_id, purchased FROM items WHERE id = ?", itemId);
  if (!item || item.purchased) return [];
  const hits = all<{ user_id: number; target_cents: number }>(
    "SELECT user_id, target_cents FROM price_watches WHERE item_id = ? AND notified_at IS NULL AND target_cents >= ?",
    itemId, priceCents,
  );
  for (const w of hits) {
    notify(w.user_id, "deal", `🎯 ${item.title} hit your target: ${formatMoney(priceCents)} (you wanted ${formatMoney(w.target_cents)} or less)`, `/lists/${item.list_id}#item-${itemId}`);
    run("UPDATE price_watches SET notified_at = unixepoch() WHERE item_id = ? AND user_id = ?", itemId, w.user_id);
  }
  return hits.map((w) => w.user_id);
}
