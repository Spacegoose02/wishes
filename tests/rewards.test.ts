import { beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type * as Rewards from "@/lib/rewards";
import { avatarTier, rollAvatar } from "@/components/Avatar";

let t: Awaited<ReturnType<typeof testDb>>;
let rw: typeof Rewards;

beforeAll(async () => {
  t = await testDb();
  rw = await import("@/lib/rewards");
});

describe("badges", () => {
  it("awards each badge once, with one golden roll", () => {
    const u = t.user("badger");
    expect(rw.award(u.id, "first_wish")).toBe(true);
    expect(rw.award(u.id, "first_wish")).toBe(false);
    expect(rw.award(u.id, "thank_you")).toBe(true);
    const row = t.db.get<{ badges: string; bonus_rolls: number }>("SELECT badges, bonus_rolls FROM users WHERE id = ?", u.id)!;
    expect(rw.parseBadges(row.badges)).toEqual(["first_wish", "thank_you"]);
    expect(row.bonus_rolls).toBe(2);
    expect(t.notes(u)).toHaveLength(2);
  });

  it("spends golden rolls until they run out", () => {
    const u = t.user("roller");
    rw.award(u.id, "santa_done");
    expect(rw.spendBonusRoll(u.id)).toBe(true);
    expect(rw.spendBonusRoll(u.id)).toBe(false);
  });

  it("ignores unknown badge ids", () => expect(rw.parseBadges("first_wish,bogus,")).toEqual(["first_wish"]));
});

describe("golden rolls", () => {
  it("never land on a common", () => {
    for (let i = 0; i < 100; i++) {
      const v = i / 100;
      expect(avatarTier(rollAvatar(() => v, true))).not.toBe("common");
    }
    expect(avatarTier(rollAvatar(() => 0.99))).toBe("common");
  });
});
