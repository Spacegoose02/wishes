import { beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type * as Countdown from "@/lib/countdown";

let t: Awaited<ReturnType<typeof testDb>>;
let cd: typeof Countdown;

beforeAll(async () => {
  t = await testDb();
  cd = await import("@/lib/countdown");
});

const at = (d: string) => new Date(d + "T10:00:00").getTime();

describe("nextOccurrence", () => {
  it("finds this year's or next year's date", () => {
    expect(cd.nextOccurrence("2015-12-25", at("2026-10-30"))).toBe("2026-12-25");
    expect(cd.nextOccurrence("2015-03-01", at("2026-10-30"))).toBe("2027-03-01");
    expect(cd.nextOccurrence("2015-10-30", at("2026-10-30"))).toBe("2026-10-30");
  });
  it("moves leap-day birthdays to Feb 28", () => expect(cd.nextOccurrence("2016-02-29", at("2026-10-30"))).toBe("2027-02-28"));
  it("ignores junk", () => expect(cd.nextOccurrence("soon")).toBeUndefined());
});

describe("sleepsLabel", () => {
  it("counts sleeps", () => {
    expect(cd.sleepsLabel(1, "Christmas")).toEqual({ count: 1, text: "sleep until Christmas" });
    expect(cd.sleepsLabel(5, "Christmas")).toEqual({ count: 5, text: "sleeps until Christmas" });
    expect(cd.sleepsLabel(0, "Christmas")).toEqual({ count: null, text: "Today is Christmas!" });
  });
});

describe("upcomingEvents", () => {
  it("gathers lists and birthdays I can see, soonest first", () => {
    const [me, sis] = ["cme", "csis"].map(t.user);
    t.family("CFam", me, sis);
    const now = at("2026-11-01");
    t.list(t.profileOf(sis), { eventDate: "2026-12-25", occasion: "Christmas" });
    t.list(t.profileOf(sis), { eventDate: "2027-06-01" }); // too far off
    t.db.run("UPDATE profiles SET birthday = '2010-11-05' WHERE id = ?", t.profileOf(me));
    const kid = t.profileOf(me, "Tot");
    t.db.run("UPDATE profiles SET birthday = '2020-11-20' WHERE id = ?", kid);
    t.list(kid, { eventDate: "2026-11-20", occasion: "birthday" }); // same day as the birthday: one entry
    expect(cd.upcomingEvents(me, 60, now).map((u) => [u.days, u.label])).toEqual([
      [4, "your birthday"],
      [19, "Tot's birthday"],
      [54, "csis's Christmas"],
    ]);
  });
});
