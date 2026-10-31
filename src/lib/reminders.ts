import "server-only";
import { all, get, run } from "./db";
import { getList, listAccess } from "./access";
import { daysUntil } from "./format";
import { notify } from "./prices";
import type { User } from "./types";

// A week before a list's day: nudge family who haven't picked anything, and remind
// people who claimed something but haven't marked it bought. Each list date is done once.

export const REMIND_DAYS = 7;

export function sendEventReminders(now = Date.now()): number {
  let sent = 0;
  const lists = all<{ id: number; event_date: string }>(
    `SELECT l.id, l.event_date FROM lists l WHERE l.event_date IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM reminders_sent r WHERE r.list_id = l.id AND r.event_date = l.event_date)`,
  );
  const people = all<User>("SELECT * FROM users WHERE id IN (SELECT user_id FROM family_members)");
  for (const row of lists) {
    const days = daysUntil(row.event_date, now);
    if (days === undefined || days < 1 || days > REMIND_DAYS) continue;
    const list = getList(row.id);
    if (!list) continue;
    run("INSERT OR IGNORE INTO reminders_sent (list_id, event_date) VALUES (?, ?)", list.id, row.event_date);
    const open = get<{ n: number }>("SELECT COUNT(*) AS n FROM items WHERE list_id = ? AND needs_approval = 0 AND archived_at IS NULL", list.id)!.n;
    const what = `${list.profile_name}'s ${list.occasion || list.title}`;
    const when = days === 1 ? "tomorrow" : `in ${days} days`;
    const link = `/lists/${list.id}`;
    for (const u of people) {
      // Only shoppers: the list's own person and its managers never get these.
      if (listAccess(u, list) !== "viewer") continue;
      const unbought = all<{ title: string }>(
        `SELECT i.title FROM items i WHERE i.list_id = ? AND i.claimed_by = ? AND i.purchased = 0 AND i.archived_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM purchases p WHERE p.item_id = i.id AND p.buyer_user_id = ? AND p.status != 'rejected')`,
        list.id, u.id, u.id,
      );
      if (unbought.length) {
        const names = unbought.slice(0, 3).map((i) => i.title).join(", ") + (unbought.length > 3 ? ` and ${unbought.length - 3} more` : "");
        notify(u.id, "reminder", `${what} is ${when}. You're getting ${names}; mark it bought once you have it.`, link);
        sent++;
        continue;
      }
      const involved = get(
        `SELECT 1 FROM items i WHERE i.list_id = ? AND i.claimed_by = ?
         UNION SELECT 1 FROM purchases p WHERE p.list_id = ? AND p.buyer_user_id = ?
         UNION SELECT 1 FROM pledges pl JOIN items i ON i.id = pl.item_id WHERE i.list_id = ? AND pl.user_id = ?`,
        list.id, u.id, list.id, u.id, list.id, u.id,
      );
      if (!involved && open > 0) {
        notify(u.id, "reminder", `${what} is ${when} and you haven't picked a gift yet.`, link);
        sent++;
      }
    }
  }
  return sent;
}
