import "server-only";
import { all, get, run } from "./db";
import { listShoppers, type ListWithOwner } from "./access";
import { notifyOnce } from "./notify";

// "What's new": alerts when wishes are added to a list you shop from, and a "new" mark on
// wishes added since your last visit.

export function announceWishes(list: ListWithOwner, count: number, byUserId: number | null) {
  if (count < 1) return;
  const wants = new Set(all<{ id: number }>("SELECT id FROM users WHERE alert_new_wishes = 1").map((r) => r.id));
  for (const uid of listShoppers(list.id)) {
    if (uid === byUserId || !wants.has(uid)) continue;
    notifyOnce(uid, "new_wishes", `/lists/${list.id}`, (n) => `${list.profile_name} has ${n} new ${n === 1 ? "wish" : "wishes"} on "${list.title}"`, count);
  }
}

// When the person last looked at the list (undefined if never), and marks it seen now.
export function seeList(userId: number, listId: number, now = Math.floor(Date.now() / 1000)): number | undefined {
  const before = get<{ seen_at: number }>("SELECT seen_at FROM list_seen WHERE user_id = ? AND list_id = ?", userId, listId)?.seen_at;
  run(
    "INSERT INTO list_seen (user_id, list_id, seen_at) VALUES (?, ?, ?) ON CONFLICT(user_id, list_id) DO UPDATE SET seen_at = excluded.seen_at",
    userId, listId, now,
  );
  // Opening the list counts as reading its "new wishes" alert.
  run("UPDATE notifications SET read = 1 WHERE user_id = ? AND kind = 'new_wishes' AND link = ?", userId, `/lists/${listId}`);
  return before;
}

export type Freshness = { newWishes: number; neverSeen: boolean };

// For list cards: how many wishes were added since the viewer last looked.
export function freshness(userId: number, listIds: number[]): Map<number, Freshness> {
  const out = new Map<number, Freshness>();
  if (!listIds.length) return out;
  const marks = `(${listIds.map(() => "?").join(",")})`;
  const rows = all<{ id: number; seen_at: number | null; n: number; created_at: number }>(
    `SELECT l.id, s.seen_at, l.created_at,
       (SELECT COUNT(*) FROM items i WHERE i.list_id = l.id AND i.archived_at IS NULL AND i.needs_approval = 0
          AND s.seen_at IS NOT NULL AND i.created_at > s.seen_at AND (i.added_by IS NULL OR i.added_by != ?)) AS n
     FROM lists l LEFT JOIN list_seen s ON s.list_id = l.id AND s.user_id = ? WHERE l.id IN ${marks}`,
    userId, userId, ...listIds,
  );
  // Only lists made in the last two weeks count as new; older ones just haven't been opened.
  const recent = Math.floor(Date.now() / 1000) - 14 * 86400;
  for (const r of rows) out.set(r.id, { newWishes: r.n, neverSeen: r.seen_at === null && r.created_at > recent });
  return out;
}
