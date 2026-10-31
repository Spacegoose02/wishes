import { beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type * as Calendar from "@/lib/calendar";

let t: Awaited<ReturnType<typeof testDb>>;
let cal: typeof Calendar;

beforeAll(async () => {
  t = await testDb();
  cal = await import("@/lib/calendar");
});

describe("ics", () => {
  it("escapes text and folds long lines", () => {
    expect(cal.icsEscape("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
    const folded = cal.foldLine("SUMMARY:" + "x".repeat(100));
    expect(folded.split("\r\n ").every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe("SUMMARY:" + "x".repeat(100));
  });

  it("builds all-day events, yearly for birthdays", () => {
    const ics = cal.buildIcs(
      [
        { uid: "b@w", date: "2015-12-31", summary: "🎂 Mia's birthday", yearly: true },
        { uid: "l@w", date: "2026-11-20", summary: "Party, games", url: "https://x/lists/1" },
        { uid: "bad@w", date: "soon", summary: "skip me" },
      ],
      new Date("2026-10-30T12:00:00Z"),
    );
    expect(ics).toContain("DTSTART;VALUE=DATE:20151231\r\nDTEND;VALUE=DATE:20160101");
    expect(ics).toContain("RRULE:FREQ=YEARLY");
    expect(ics).toContain("SUMMARY:Party\\, games");
    expect(ics).toContain("DTSTAMP:20261030T120000Z");
    expect(ics).not.toContain("skip me");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
  });
});

describe("calendar feed", () => {
  it("covers only what the user can see, behind a resettable token", () => {
    const [me, sis, stranger] = ["calme", "calsis", "calx"].map(t.user);
    t.family("CalFam", me, sis);
    t.db.run("UPDATE profiles SET birthday = '1990-05-04' WHERE id = ?", t.profileOf(sis));
    t.list(t.profileOf(sis), { eventDate: "2026-12-25" });
    t.list(t.profileOf(stranger), { eventDate: "2026-12-24" });
    const events = cal.calendarEvents(me, "https://w");
    expect(events.map((e) => e.date).sort()).toEqual(["1990-05-04", "2026-12-25"]);

    const tok = cal.calendarToken(me.id);
    expect(cal.calendarToken(me.id)).toBe(tok);
    expect(cal.userByCalendarToken(tok)!.id).toBe(me.id);
    const fresh = cal.calendarToken(me.id, true);
    expect(fresh).not.toBe(tok);
    expect(cal.userByCalendarToken(tok)).toBeUndefined();
    expect(cal.userByCalendarToken("")).toBeUndefined();
  });
});
