import "server-only";
import { all, get, run, tx } from "./db";
import { daysUntil } from "./format";
import { nextOccurrence } from "./countdown";
import type { Profile, WishList } from "./types";

// Copying lists, and yearly occasions that move to next year's date.

// A fresh copy of a list for one of the copier's profiles: same details and active wishes,
// with no claims, purchases, pledges or stars carried over.
export function copyList(from: WishList, profile: Profile, title: string, byUserId: number, now = Date.now()): number {
  return tx(() => {
    const r = run(
      "INSERT INTO lists (profile_id, title, description, emoji, occasion, event_date, visibility, yearly) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      profile.id, title.slice(0, 120) || from.title, from.description, from.emoji, from.occasion,
      from.yearly && from.event_date ? nextOccurrence(from.event_date, now) ?? null : null,
      from.visibility === "custom" ? "family" : from.visibility, from.yearly,
    );
    const id = Number(r.lastInsertRowid);
    run(
      `INSERT INTO items (list_id, title, url, store, price_cents, currency, image_url, notes, priority, quantity, category, variant, color, size)
       SELECT ?, title, url, store, price_cents, currency, image_url, notes, priority, quantity, category, variant, color, size
       FROM items WHERE list_id = ? AND archived_at IS NULL AND needs_approval = 0 ORDER BY id`,
      id, from.id,
    );
    if (profile.user_id !== byUserId) run("INSERT OR IGNORE INTO list_owners (list_id, user_id) VALUES (?, ?)", id, byUserId);
    return id;
  });
}

// How long after the day a yearly list waits before rolling, so the reveal and thank-yous can happen.
export const ROLL_GRACE_DAYS = 14;

export function rollDate(eventDate: string | null, now = Date.now()): string | null {
  const days = daysUntil(eventDate, now);
  if (!eventDate || days === undefined || days > -ROLL_GRACE_DAYS) return null;
  return nextOccurrence(eventDate, now) ?? null;
}

// Move a yearly list to next year's date. Gifts that were bought go to past gifts as received.
export function rollList(list: Pick<WishList, "id" | "event_date" | "yearly">, now = Date.now()): string | null {
  if (!list.yearly) return null;
  const next = rollDate(list.event_date, now);
  if (!next) return null;
  tx(() => {
    run("UPDATE items SET archived_at = unixepoch(), archive_reason = 'received', must_have = 0 WHERE list_id = ? AND purchased = 1 AND archived_at IS NULL", list.id);
    run("UPDATE lists SET event_date = ? WHERE id = ?", next, list.id);
  });
  return next;
}

export function rollYearlyLists(now = Date.now()): number {
  let n = 0;
  for (const l of all<WishList>("SELECT * FROM lists WHERE yearly = 1 AND event_date IS NOT NULL")) if (rollList(l, now)) n++;
  return n;
}

export function profileById(id: number): Profile | undefined {
  return get<Profile>("SELECT * FROM profiles WHERE id = ?", id);
}
