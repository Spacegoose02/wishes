import "server-only";
import { all, get, run, tx } from "./db";

// Secret Santa: a family admin picks who's in, then names are drawn so nobody gets
// themselves or someone from their own household. Each person only ever sees their own match.

export type Exchange = {
  id: number;
  family_id: number;
  name: string;
  budget_cents: number | null;
  exchange_date: string | null;
  created_by: number | null;
  drawn_at: number | null;
};
export type Participant = { user_id: number; name: string; avatar: string; household: string; done: number };
export type DrawPerson = { id: number; household: string };

const sameHouse = (a: DrawPerson, b: DrawPerson) => !!a.household && a.household.toLowerCase() === b.household.toLowerCase();

export function canGiveTo(giver: DrawPerson, giftee: DrawPerson): boolean {
  return giver.id !== giftee.id && !sameHouse(giver, giftee);
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Random giver -> giftee pairing that follows the rules, or null when none exists
// (e.g. one household has more than half the people). Backtracks, most-constrained first.
export function drawNames(people: DrawPerson[], rand: () => number = Math.random): Map<number, number> | null {
  if (people.length < 2) return null;
  const options = new Map(people.map((g) => [g.id, people.filter((c) => canGiveTo(g, c))]));
  const givers = shuffle(people, rand).sort((a, b) => options.get(a.id)!.length - options.get(b.id)!.length);
  const taken = new Set<number>();
  const result = new Map<number, number>();
  const place = (i: number): boolean => {
    if (i === givers.length) return true;
    for (const c of shuffle(options.get(givers[i].id)!, rand)) {
      if (taken.has(c.id)) continue;
      taken.add(c.id);
      result.set(givers[i].id, c.id);
      if (place(i + 1)) return true;
      taken.delete(c.id);
      result.delete(givers[i].id);
    }
    return false;
  };
  return place(0) ? result : null;
}

export function getExchange(id: number): Exchange | undefined {
  return get<Exchange>("SELECT * FROM exchanges WHERE id = ?", id);
}

export function participants(exchangeId: number): Participant[] {
  return all<Participant>(
    `SELECT ep.user_id, u.name, u.avatar, ep.household, ep.done FROM exchange_people ep
     JOIN users u ON u.id = ep.user_id WHERE ep.exchange_id = ? ORDER BY ep.household, u.name`,
    exchangeId,
  );
}

// People who can join a family's exchange: its members plus members of connected families.
// Default household: the connected family's name for its members, blank (just them) otherwise.
export function eligiblePeople(familyId: number): { id: number; name: string; avatar: string; household: string }[] {
  return all<{ id: number; name: string; avatar: string; household: string }>(
    `SELECT u.id, u.name, u.avatar, '' AS household FROM users u JOIN family_members m ON m.user_id = u.id WHERE m.family_id = :f
     UNION
     SELECT u.id, u.name, u.avatar, f.name AS household FROM users u
       JOIN family_members m ON m.user_id = u.id JOIN families f ON f.id = m.family_id
       JOIN family_links l ON (l.family_a = :f AND l.family_b = f.id) OR (l.family_b = :f AND l.family_a = f.id)
     WHERE u.id NOT IN (SELECT user_id FROM family_members WHERE family_id = :f)
     ORDER BY name`.replaceAll(":f", "?"),
    familyId, familyId, familyId, familyId,
  );
}

// Exchanges the user is in, or can run as an admin of the family.
export function myExchanges(userId: number): (Exchange & { family_name: string; is_admin: number; in_it: number })[] {
  return all<Exchange & { family_name: string; is_admin: number; in_it: number }>(
    `SELECT e.*, f.name AS family_name,
       EXISTS (SELECT 1 FROM family_members m WHERE m.family_id = e.family_id AND m.user_id = ? AND m.role = 'admin') AS is_admin,
       EXISTS (SELECT 1 FROM exchange_people ep WHERE ep.exchange_id = e.id AND ep.user_id = ?) AS in_it
     FROM exchanges e JOIN families f ON f.id = e.family_id
     WHERE e.id IN (SELECT exchange_id FROM exchange_people WHERE user_id = ?)
        OR e.family_id IN (SELECT family_id FROM family_members WHERE user_id = ? AND role = 'admin')
     ORDER BY e.exchange_date IS NULL, e.exchange_date, e.created_at DESC`,
    userId, userId, userId, userId,
  );
}

export function isFamilyAdmin(userId: number, familyId: number): boolean {
  return !!get("SELECT 1 FROM family_members WHERE family_id = ? AND user_id = ? AND role = 'admin'", familyId, userId);
}

// Replace who's in. Changing the people after a draw clears it, so it has to be drawn again.
export function setParticipants(exchangeId: number, people: { id: number; household: string }[]) {
  const allowed = new Set(eligiblePeople(getExchange(exchangeId)!.family_id).map((p) => p.id));
  tx(() => {
    run("DELETE FROM exchange_people WHERE exchange_id = ?", exchangeId);
    for (const p of people) {
      if (allowed.has(p.id)) run("INSERT OR IGNORE INTO exchange_people (exchange_id, user_id, household) VALUES (?, ?, ?)", exchangeId, p.id, p.household.slice(0, 60));
    }
    run("UPDATE exchanges SET drawn_at = NULL WHERE id = ?", exchangeId);
  });
}

export function runDraw(exchangeId: number, rand: () => number = Math.random): { ok: true } | { ok: false; error: string } {
  const people = participants(exchangeId).map((p) => ({ id: p.user_id, household: p.household }));
  if (people.length < 3) return { ok: false, error: "Secret Santa needs at least three people." };
  const pairs = drawNames(people, rand);
  if (!pairs) return { ok: false, error: "No fair draw is possible. Try splitting up the biggest household or adding people." };
  tx(() => {
    for (const [giver, giftee] of pairs) run("UPDATE exchange_people SET giftee_id = ?, done = 0 WHERE exchange_id = ? AND user_id = ?", giftee, exchangeId, giver);
    run("UPDATE exchanges SET drawn_at = unixepoch() WHERE id = ?", exchangeId);
  });
  return { ok: true };
}

// The one thing a participant may see: who they're giving to.
export function myMatch(exchangeId: number, userId: number): { id: number; name: string; avatar: string; done: number } | undefined {
  return get<{ id: number; name: string; avatar: string; done: number }>(
    `SELECT u.id, u.name, u.avatar, ep.done FROM exchange_people ep JOIN exchanges e ON e.id = ep.exchange_id
     JOIN users u ON u.id = ep.giftee_id WHERE ep.exchange_id = ? AND ep.user_id = ? AND e.drawn_at IS NOT NULL`,
    exchangeId, userId,
  );
}
