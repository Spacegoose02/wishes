import { beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type * as Fresh from "@/lib/fresh";

let t: Awaited<ReturnType<typeof testDb>>;
let f: typeof Fresh;

beforeAll(async () => {
  t = await testDb();
  f = await import("@/lib/fresh");
});

describe("new wishes", () => {
  it("tells the family, folded into one alert, but not the person, the adder, or people who opted out", () => {
    const me = t.user("listmaker");
    const mom = t.user("mom");
    const quiet = t.user("quiet");
    t.family("fam", me, mom, quiet);
    t.db.run("UPDATE users SET alert_new_wishes = 0 WHERE id = ?", quiet.id);
    const l = t.list(t.profileOf(me));
    expect(t.access.listShoppers(l.id)).toEqual([mom.id, quiet.id]);
    f.announceWishes(l, 1, me.id);
    f.announceWishes(l, 2, me.id);
    expect(t.notes(mom)).toEqual([`listmaker has 3 new wishes on "List"`]);
    expect(t.notes(me)).toEqual([]);
    expect(t.notes(quiet)).toEqual([]);
  });

  it("leaves out people the list is hidden from, and hidden lists", () => {
    const me = t.user("hider");
    const sis = t.user("sis");
    t.family("fam2", me, sis);
    const l = t.list(t.profileOf(me));
    t.db.run("INSERT INTO list_hidden_users (list_id, user_id) VALUES (?, ?)", l.id, sis.id);
    expect(t.access.listShoppers(l.id)).toEqual([]);
    const l2 = t.list(t.profileOf(me));
    t.db.run("UPDATE lists SET visibility = 'private' WHERE id = ?", l2.id);
    expect(t.access.listShoppers(l2.id)).toEqual([]);
  });

  it("counts wishes added since the last visit", () => {
    const me = t.user("visited");
    const dad = t.user("dad");
    const l = t.list(t.profileOf(me));
    expect(f.freshness(dad.id, [l.id]).get(l.id)).toEqual({ newWishes: 0, neverSeen: true });
    const now = Math.floor(Date.now() / 1000);
    expect(f.seeList(dad.id, l.id, now - 100)).toBeUndefined();
    t.item(l.id, "Added later");
    expect(f.freshness(dad.id, [l.id]).get(l.id)).toEqual({ newWishes: 1, neverSeen: false });
    expect(f.seeList(dad.id, l.id, now + 5)).toBe(now - 100);
    expect(f.freshness(dad.id, [l.id]).get(l.id)!.newWishes).toBe(0);
  });
});
