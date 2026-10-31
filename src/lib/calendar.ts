import "server-only";
import { get, run } from "./db";
import { familyProfiles, myLists, myProfiles, sharedWithMe } from "./access";
import { myExchanges } from "./santa";
import { randomToken } from "./crypto";
import type { User } from "./types";

// A private .ics feed of birthdays and list dates the user can already see.
// The token in the URL is the only key, so it can be reset from Settings.

export type CalEvent = { uid: string; date: string; summary: string; url?: string; yearly?: boolean };

export function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// Lines longer than 75 octets continue on the next line after a space (RFC 5545).
export function foldLine(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch, "utf8") > (parts.length ? 74 : 75)) {
      parts.push(cur);
      cur = "";
    }
    cur += ch;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

const day = (d: string) => d.replace(/-/g, "");
function nextDay(d: string): string {
  const [y, m, dd] = d.split("-").map(Number);
  const n = new Date(Date.UTC(y, m - 1, dd + 1));
  return n.toISOString().slice(0, 10).replace(/-/g, "");
}

export function buildIcs(events: CalEvent[], stamp = new Date()): string {
  const now = stamp.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Wishes//Family wishlists//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Wishes"];
  for (const e of events) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${day(e.date)}`,
      `DTEND;VALUE=DATE:${nextDay(e.date)}`,
      `SUMMARY:${icsEscape(e.summary)}`,
      ...(e.yearly ? ["RRULE:FREQ=YEARLY"] : []),
      ...(e.url ? [`URL:${e.url}`] : []),
      "TRANSP:TRANSPARENT",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export function calendarEvents(user: User, origin: string): CalEvent[] {
  const events: CalEvent[] = [];
  for (const p of [...myProfiles(user.id), ...familyProfiles(user.id)]) {
    if (!p.birthday || p.linked_user_id) continue;
    const self = p.user_id === user.id && p.is_primary;
    events.push({ uid: `bday-${p.id}@wishes`, date: p.birthday, summary: `🎂 ${self ? "My birthday" : `${p.name}'s birthday`}`, yearly: true });
  }
  const seen = new Set<number>();
  for (const l of [...myLists(user.id), ...sharedWithMe(user.id)]) {
    if (!l.event_date || seen.has(l.id)) continue;
    seen.add(l.id);
    events.push({ uid: `list-${l.id}@wishes`, date: l.event_date, summary: `${l.emoji} ${l.title} (${l.profile_name})`, url: `${origin}/lists/${l.id}` });
  }
  for (const e of myExchanges(user.id)) {
    if (e.exchange_date && e.in_it) events.push({ uid: `santa-${e.id}@wishes`, date: e.exchange_date, summary: `🎅 ${e.name}`, url: `${origin}/santa/${e.id}` });
  }
  return events;
}

export function calendarToken(userId: number, reset = false): string {
  const cur = get<{ calendar_token: string | null }>("SELECT calendar_token FROM users WHERE id = ?", userId)?.calendar_token;
  if (cur && !reset) return cur;
  const token = randomToken(24);
  run("UPDATE users SET calendar_token = ? WHERE id = ?", token, userId);
  return token;
}

export function userByCalendarToken(token: string): User | undefined {
  return token ? get<User>("SELECT * FROM users WHERE calendar_token = ?", token) : undefined;
}
