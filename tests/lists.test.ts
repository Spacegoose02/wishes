import { beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type * as Lists from "@/lib/lists";
import type { Item, WishList } from "@/lib/types";

let t: Awaited<ReturnType<typeof testDb>>;
let ls: typeof Lists;

beforeAll(async () => {
  t = await testDb();
  ls = await import("@/lib/lists");
});

const at = (d: string) => new Date(d + "T10:00:00").getTime();
const listRow = (id: number) => t.db.get<WishList>("SELECT * FROM lists WHERE id = ?", id)!;

describe("copyList", () => {
  it("copies active wishes without claims, stars or purchases", () => {
    const [mom, aunt] = ["lmom", "launt"].map(t.user);
    const from = t.list(t.profileOf(mom));
    const kept = t.item(from.id, "Kept");
    t.db.run("UPDATE items SET claimed_by = ?, purchased = 1, must_have = 1 WHERE id = ?", aunt.id, kept.id);
    t.db.run("UPDATE items SET archived_at = 1 WHERE id = ?", t.item(from.id, "Old").id);
    t.db.run("UPDATE items SET needs_approval = 1 WHERE id = ?", t.item(from.id, "Pending").id);
    const kid = t.db.get<{ id: number }>("SELECT id FROM profiles WHERE id = ?", t.profileOf(mom, "Kiddo"))!.id;
    const id = ls.copyList(listRow(from.id), ls.profileById(kid)!, "Next year", mom.id);
    const items = t.db.all<Item>("SELECT * FROM items WHERE list_id = ?", id);
    expect(items.map((i) => [i.title, i.claimed_by, i.purchased, i.must_have])).toEqual([["Kept", null, 0, 0]]);
    expect(listRow(id).title).toBe("Next year");
    // Copying onto someone else's profile makes you a co-owner.
    const other = ls.copyList(listRow(from.id), ls.profileById(t.profileOf(aunt))!, "", mom.id);
    expect(t.access.isManager(mom.id, t.access.getList(other)!)).toBe(true);
  });
});

describe("yearly lists", () => {
  it("roll forward two weeks after the day, filing bought gifts", () => {
    expect(ls.rollDate("2026-10-20", at("2026-10-30"))).toBeNull();
    expect(ls.rollDate("2026-10-10", at("2026-10-30"))).toBe("2027-10-10");
    expect(ls.rollDate(null, at("2026-10-30"))).toBeNull();

    const l = t.list(t.profileOf(t.user("yearly")), { eventDate: "2026-10-01" });
    t.db.run("UPDATE lists SET yearly = 1 WHERE id = ?", l.id);
    const bought = t.item(l.id, "Bought");
    t.db.run("UPDATE items SET purchased = 1 WHERE id = ?", bought.id);
    t.item(l.id, "Still wanted");
    expect(ls.rollYearlyLists(at("2026-10-30"))).toBeGreaterThanOrEqual(1);
    expect(listRow(l.id).event_date).toBe("2027-10-01");
    expect(t.db.all<Item>("SELECT * FROM items WHERE list_id = ? AND archived_at IS NULL", l.id).map((i) => i.title)).toEqual(["Still wanted"]);
    expect(ls.rollList(listRow(l.id), at("2026-10-30"))).toBeNull();
  });

  it("leaves one-off lists alone", () => {
    const l = t.list(t.profileOf(t.user("once")), { eventDate: "2020-01-01" });
    expect(ls.rollList(listRow(l.id))).toBeNull();
  });
});
