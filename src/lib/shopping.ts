import "server-only";
import { all, run } from "./db";
import { familyProfiles, getList, listAccess, myProfiles } from "./access";
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
     WHERE i.claimed_by = ? AND i.purchased = 0 AND i.needs_approval = 0 AND i.archived_at IS NULL
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

export type Budget = {
  id: number;
  profile_id: number;
  name: string;
  avatar: string;
  occasion: string;
  amount_cents: number;
  spent_cents: number;
  left_cents: number;
  pct: number;
  over: boolean;
};

const yearRange = (year: number) => [Math.floor(Date.UTC(year, 0, 1) / 1000), Math.floor(Date.UTC(year + 1, 0, 1) / 1000)];

// Spent vs left for each budget the user set this year. An occasion budget only counts
// purchases on lists with that occasion; a blank one counts everything for that person.
export function budgetsFor(userId: number, year: number): Budget[] {
  const [from, to] = yearRange(year);
  return all<Omit<Budget, "left_cents" | "pct" | "over">>(
    `SELECT b.id, b.profile_id, p.name, p.avatar, b.occasion, b.amount_cents,
       (SELECT COALESCE(SUM(COALESCE(pu.price_cents, 0) * pu.quantity), 0) FROM purchases pu JOIN lists l ON l.id = pu.list_id
        WHERE pu.buyer_user_id = b.user_id AND l.profile_id = b.profile_id AND pu.status != 'rejected'
          AND pu.created_at >= ? AND pu.created_at < ?
          AND (b.occasion = '' OR lower(l.occasion) = lower(b.occasion))) AS spent_cents
     FROM budgets b JOIN profiles p ON p.id = b.profile_id
     WHERE b.user_id = ? AND b.year = ? ORDER BY p.name, b.occasion`,
    from, to, userId, year,
  ).map((b) => ({
    ...b,
    left_cents: Math.max(0, b.amount_cents - b.spent_cents),
    pct: b.amount_cents ? Math.min(100, Math.round((b.spent_cents / b.amount_cents) * 100)) : 0,
    over: b.spent_cents > b.amount_cents,
  }));
}

// People a user can set a budget for: their own profiles and their families' profiles.
export function budgetPeople(userId: number) {
  return [...myProfiles(userId), ...familyProfiles(userId)].filter((p) => !(p.user_id === userId && p.is_primary));
}

export function setBudget(userId: number, profileId: number, occasion: string, year: number, amountCents: number | null): boolean {
  if (!budgetPeople(userId).some((p) => p.id === profileId)) return false;
  const occ = occasion.trim().slice(0, 40);
  if (!amountCents) {
    run("DELETE FROM budgets WHERE user_id = ? AND profile_id = ? AND occasion = ? AND year = ?", userId, profileId, occ, year);
    return true;
  }
  run(
    `INSERT INTO budgets (user_id, profile_id, occasion, year, amount_cents) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, profile_id, occasion, year) DO UPDATE SET amount_cents = excluded.amount_cents`,
    userId, profileId, occ, year, amountCents,
  );
  return true;
}

// What's left to spend on someone for a given occasion: the occasion's own budget if set,
// otherwise their all-occasions budget. Undefined when no budget applies.
export function budgetLeft(userId: number, profileId: number, occasion: string, year: number): Budget | undefined {
  const mine = budgetsFor(userId, year).filter((b) => b.profile_id === profileId);
  return mine.find((b) => b.occasion && b.occasion.toLowerCase() === occasion.toLowerCase()) ?? mine.find((b) => !b.occasion);
}
