import "server-only";
import { all, get, run, tx } from "./db";
import { getList, isManager, myLists, type ListWithOwner } from "./access";
import type { Item } from "./types";

// Shared wishes: something the kids will share (a trampoline, a game console) lives on one
// list and also shows up on a sibling's list. It's still one wish, so one claim, one purchase
// and one set of pledges cover everyone, and nobody buys it twice.

// Everyone a shared wish is for: the list it lives on first, then the lists it's shared into.
export type SharePerson = {
  list_id: number;
  profile_id: number;
  profile_name: string;
  profile_avatar: string;
  profile_is_primary: number;
  owner_user_id: number;
};

const PERSON = `l.id AS list_id, p.id AS profile_id, p.name AS profile_name, p.avatar AS profile_avatar,
  p.is_primary AS profile_is_primary, p.user_id AS owner_user_id`;

// Lists a wish on `list` can be shared into: other people's lists the user manages
// (usually the siblings'), never the user's own grown-up list.
export function shareTargets(userId: number, list: Pick<ListWithOwner, "id" | "profile_id">): ListWithOwner[] {
  return myLists(userId).filter(
    (l) => l.id !== list.id && l.profile_id !== list.profile_id && !(l.profile_is_primary && l.owner_user_id === userId),
  );
}

// Replace the lists a wish is shared into. Lists the user can't manage, or that belong to the
// same person as the wish's own list, are skipped. Surprises are never shared. Returns how many stuck.
export function setShares(item: Pick<Item, "id" | "list_id" | "surprise">, listIds: number[], userId: number): number {
  const home = getList(item.list_id);
  const ok = home && !item.surprise
    ? [...new Set(listIds)].map(getList).filter((l): l is ListWithOwner =>
      !!l && l.id !== home.id && l.profile_id !== home.profile_id && isManager(userId, l))
    : [];
  tx(() => {
    run("DELETE FROM item_shares WHERE item_id = ?", item.id);
    for (const l of ok) run("INSERT INTO item_shares (item_id, list_id) VALUES (?, ?)", item.id, l.id);
  });
  return ok.length;
}

export function unshare(itemId: number, listId: number) {
  run("DELETE FROM item_shares WHERE item_id = ? AND list_id = ?", itemId, listId);
}

export function sharedListIds(itemId: number): number[] {
  return all<{ list_id: number }>("SELECT list_id FROM item_shares WHERE item_id = ? ORDER BY list_id", itemId).map((r) => r.list_id);
}

export function isSharedInto(itemId: number, listId: number): boolean {
  return !!get("SELECT 1 FROM item_shares WHERE item_id = ? AND list_id = ?", itemId, listId);
}

// Active wishes that live on another list but are shared into this one.
export function sharedInto(listId: number): Item[] {
  return all<Item>(
    `SELECT i.* FROM items i JOIN item_shares s ON s.item_id = i.id
     WHERE s.list_id = ? AND i.list_id != ? AND i.archived_at IS NULL AND i.surprise = 0
     ORDER BY i.created_at DESC`,
    listId, listId,
  );
}

// For each shared wish among `itemIds`: everyone it's for, its own list's person first.
// Wishes that aren't shared are left out.
export function sharePeople(itemIds: number[]): Map<number, SharePerson[]> {
  const map = new Map<number, SharePerson[]>();
  if (!itemIds.length) return map;
  const marks = itemIds.map(() => "?").join(",");
  const rows = all<SharePerson & { item_id: number; home: number }>(
    `SELECT i.id AS item_id, 1 AS home, ${PERSON} FROM items i
       JOIN lists l ON l.id = i.list_id JOIN profiles p ON p.id = l.profile_id
     WHERE i.id IN (${marks}) AND EXISTS (SELECT 1 FROM item_shares s WHERE s.item_id = i.id)
     UNION ALL
     SELECT s.item_id, 0 AS home, ${PERSON} FROM item_shares s
       JOIN lists l ON l.id = s.list_id JOIN profiles p ON p.id = l.profile_id
     WHERE s.item_id IN (${marks})
     ORDER BY item_id, home DESC, list_id`,
    ...itemIds, ...itemIds,
  );
  for (const r of rows) {
    const { item_id, home: _home, ...person } = r;
    void _home;
    map.set(item_id, [...(map.get(item_id) ?? []), person]);
  }
  return map;
}

// The wish is (also) for this user themselves, so claims and purchases stay a secret from them.
export function isForUser(people: SharePerson[] | undefined, userId: number): boolean {
  return !!people?.some((p) => p.profile_is_primary && p.owner_user_id === userId);
}

// Same check for a single wish, from the server actions.
export function sharedWithUser(itemId: number, userId: number): boolean {
  return !!get(
    `SELECT 1 FROM item_shares s JOIN lists l ON l.id = s.list_id JOIN profiles p ON p.id = l.profile_id
     WHERE s.item_id = ? AND p.is_primary = 1 AND p.user_id = ?`,
    itemId, userId,
  );
}

// "Shared with Leo & Mia": everyone but the person whose list is being looked at.
export function sharedWithLabel(people: SharePerson[], profileId: number): string {
  const names = [...new Set(people.filter((p) => p.profile_id !== profileId).map((p) => p.profile_name))];
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}
