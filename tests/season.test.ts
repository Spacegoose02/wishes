import { describe, expect, it } from "vitest";
import { celebrationPieces, seasonFor } from "@/lib/season";

describe("seasonFor", () => {
  it.each([
    ["2026-12-20", "winter holidays"],
    ["2027-01-03", "winter holidays"],
    ["2026-10-31", "fall"],
    ["2027-02-14", "valentines"],
    ["2027-02-20", "party"],
    ["2027-04-01", "spring"],
    ["2027-07-04", "summer"],
    ["2026-09-10", "party"],
  ])("%s is %s", (d, name) => expect(seasonFor(new Date(d + "T12:00:00")).name).toBe(name));

  it("adds cake for the big day", () => {
    expect(celebrationPieces("event", new Date("2026-10-31T12:00:00"))).toEqual(expect.arrayContaining(["🎂", "🎃"]));
    expect(celebrationPieces("wish")).not.toContain("🎂");
  });
});
