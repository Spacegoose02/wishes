import "server-only";
import { familyProfiles, myLists, myProfiles, sharedWithMe } from "./access";
import { daysUntil } from "./format";
import { myExchanges } from "./santa";
import type { User } from "./types";

// "N sleeps until..." for the home page: list events, birthdays and Secret Santa days coming up.

export type Upcoming = { key: string; days: number; label: string; emoji: string; href: string };

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// The next time a yearly date (like a birthday) comes around, today included.
// Feb 29 falls on Feb 28 in other years.
export function nextOccurrence(date: string, now = Date.now()): string | undefined {
  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return undefined;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  for (const y of [today.getFullYear(), today.getFullYear() + 1]) {
    const d = new Date(y, Number(m[2]) - 1, Number(m[3]));
    if (d.getMonth() !== Number(m[2]) - 1) d.setDate(0); // rolled into March: back to Feb 28
    if (d >= today) return ymd(d);
  }
  return undefined;
}

// The count is shown big, so it comes back separately from the words.
export function sleepsLabel(days: number, what: string): { count: number | null; text: string } {
  if (days <= 0) return { count: null, text: `Today is ${what}!` };
  return { count: days, text: `${days === 1 ? "sleep" : "sleeps"} until ${what}` };
}

export function upcomingEvents(user: User, withinDays = 60, now = Date.now()): Upcoming[] {
  const out: Upcoming[] = [];
  const add = (u: Upcoming) => {
    if (u.days >= 0 && u.days <= withinDays && !out.some((o) => o.key === u.key)) out.push(u);
  };
  for (const l of [...myLists(user.id), ...sharedWithMe(user.id)]) {
    const days = daysUntil(l.event_date, now);
    if (days === undefined) continue;
    const mine = l.owner_user_id === user.id && l.profile_is_primary;
    const what = l.occasion ? (mine ? `your ${l.occasion}` : `${l.profile_name}'s ${l.occasion}`) : l.title;
    add({ key: `list-${l.profile_id}-${l.event_date}`, days, label: what, emoji: l.emoji, href: `/lists/${l.id}` });
  }
  for (const p of [...myProfiles(user.id), ...familyProfiles(user.id)]) {
    if (!p.birthday || p.linked_user_id) continue;
    const next = nextOccurrence(p.birthday, now);
    const days = next ? daysUntil(next, now) : undefined;
    if (days === undefined) continue;
    const self = p.user_id === user.id && p.is_primary;
    // A list for the same day already covers it.
    if (out.some((o) => o.key === `list-${p.id}-${next}`)) continue;
    add({ key: `bday-${p.id}`, days, label: self ? "your birthday" : `${p.name}'s birthday`, emoji: "🎂", href: "/" });
  }
  for (const e of myExchanges(user.id)) {
    const days = daysUntil(e.exchange_date, now);
    if (days !== undefined && e.in_it) add({ key: `santa-${e.id}`, days, label: e.name, emoji: "🎅", href: `/santa/${e.id}` });
  }
  return out.sort((a, b) => a.days - b.days);
}
