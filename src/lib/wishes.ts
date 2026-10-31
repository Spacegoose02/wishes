import "server-only";
import { all, get, run } from "./db";
import type { Item } from "./types";

// Rules about the wishes themselves (as opposed to who's buying them).

export const MAX_MUST_HAVES = 3;

export function mustHaveCount(listId: number): number {
  return get<{ n: number }>("SELECT COUNT(*) AS n FROM items WHERE list_id = ? AND must_have = 1 AND archived_at IS NULL", listId)!.n;
}

// Gold-star a wish, or take the star off. A list only gets three.
export function setMustHave(item: Item, on: boolean): { ok: true } | { ok: false; error: string } {
  if (on && !item.must_have && mustHaveCount(item.list_id) >= MAX_MUST_HAVES) {
    return { ok: false, error: `Only ${MAX_MUST_HAVES} must-haves per list. Unstar one first.` };
  }
  run("UPDATE items SET must_have = ? WHERE id = ?", on ? 1 : 0, item.id);
  return { ok: true };
}

// Shoppers only see wishes a parent has approved; the list's managers see everything.
export function visibleToShoppers(item: Pick<Item, "needs_approval">): boolean {
  return !item.needs_approval;
}

export function pendingApprovals(listId: number): number {
  return get<{ n: number }>("SELECT COUNT(*) AS n FROM items WHERE list_id = ? AND needs_approval = 1", listId)!.n;
}

export function approveItem(itemId: number) {
  run("UPDATE items SET needs_approval = 0 WHERE id = ?", itemId);
}

export type ArchiveReason = "received" | "unwanted";

// Move a wish to the past-gifts archive. A "no longer wanted" wish that someone planned to
// buy returns the people to tell (its claimer and anyone who chipped in) so they can stop.
export function archiveWish(item: Item, reason: ArchiveReason): number[] {
  run("UPDATE items SET archived_at = unixepoch(), archive_reason = ?, must_have = 0 WHERE id = ?", reason, item.id);
  if (reason !== "unwanted" || item.purchased) return [];
  const pledgers = all<{ user_id: number }>("SELECT user_id FROM pledges WHERE item_id = ?", item.id).map((r) => r.user_id);
  return [...new Set([...(item.claimed_by ? [item.claimed_by] : []), ...pledgers])];
}

export function restoreWish(itemId: number) {
  run("UPDATE items SET archived_at = NULL, archive_reason = '' WHERE id = ?", itemId);
}

// Everyone with a stake in a wish that's about to be removed: whoever claimed it, chipped in,
// or marked it bought. Read before deleting, since pledges go with the wish.
export function peopleBuying(item: Pick<Item, "id" | "claimed_by">): number[] {
  const rows = all<{ user_id: number }>(
    `SELECT user_id FROM pledges WHERE item_id = ?
     UNION SELECT buyer_user_id FROM purchases WHERE item_id = ? AND buyer_user_id IS NOT NULL AND status != 'rejected'`,
    item.id, item.id,
  ).map((r) => r.user_id);
  return [...new Set([...(item.claimed_by ? [item.claimed_by] : []), ...rows])];
}
