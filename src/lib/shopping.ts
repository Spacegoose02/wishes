import "server-only";
import { all } from "./db";
import { getList, listAccess } from "./access";
import type { User } from "./types";

// A giver's side of things: what they've promised to get, and what they've spent on whom.

export type ToBuy = {
  id: number;
  list_id: number;
  title: string;
  url: string;
  price_cents: number | null;
  quantity: number;
  list_title: string;
  list_emoji: string;
  event_date: string | null;
  for_name: string;
  for_avatar: string;
};

// Claimed but not yet bought, soonest event first (no date last).
export function toBuy(user: User): ToBuy[] {
  return all<ToBuy>(
    `SELECT i.id, i.list_id, i.title, i.url, i.price_cents, i.quantity, l.title AS list_title, l.emoji AS list_emoji,
            l.event_date, p.name AS for_name, p.avatar AS for_avatar
     FROM items i JOIN lists l ON l.id = i.list_id JOIN profiles p ON p.id = l.profile_id
     WHERE i.claimed_by = ? AND i.purchased = 0 AND i.needs_approval = 0
       AND NOT EXISTS (SELECT 1 FROM purchases pu WHERE pu.item_id = i.id AND pu.buyer_user_id = ? AND pu.status != 'rejected')
     ORDER BY l.event_date IS NULL, l.event_date, p.name, i.title`,
    user.id, user.id,
  ).filter((r) => {
    // Lists they've since lost access to drop off.
    const l = getList(r.list_id);
    return !!l && listAccess(user, l) !== "none";
  });
}

export type Spend = { profile_id: number; name: string; avatar: string; spent_cents: number; gifts: number };

// What the user has spent per person, optionally only in one calendar year.
export function spendByPerson(userId: number, year?: number): Spend[] {
  const range = year ? [Math.floor(Date.UTC(year, 0, 1) / 1000), Math.floor(Date.UTC(year + 1, 0, 1) / 1000)] : [0, 2 ** 40];
  return all<Spend>(
    `SELECT p.id AS profile_id, p.name, p.avatar,
            COALESCE(SUM(COALESCE(pu.price_cents, 0) * pu.quantity), 0) AS spent_cents, COUNT(*) AS gifts
     FROM purchases pu JOIN lists l ON l.id = pu.list_id JOIN profiles p ON p.id = l.profile_id
     WHERE pu.buyer_user_id = ? AND pu.status != 'rejected' AND NOT (p.is_primary = 1 AND p.user_id = ?)
       AND pu.created_at >= ? AND pu.created_at < ?
     GROUP BY p.id ORDER BY spent_cents DESC, p.name`,
    userId, userId, range[0], range[1],
  );
}
