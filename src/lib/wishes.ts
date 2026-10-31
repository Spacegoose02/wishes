import "server-only";
import { get, run } from "./db";
import type { Item } from "./types";

// Rules about the wishes themselves (as opposed to who's buying them).

export const MAX_MUST_HAVES = 3;

export function mustHaveCount(listId: number): number {
  return get<{ n: number }>("SELECT COUNT(*) AS n FROM items WHERE list_id = ? AND must_have = 1", listId)!.n;
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
