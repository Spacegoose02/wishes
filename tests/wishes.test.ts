import { beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type * as Wishes from "@/lib/wishes";
import type { Item } from "@/lib/types";

let t: Awaited<ReturnType<typeof testDb>>;
let w: typeof Wishes;

beforeAll(async () => {
  t = await testDb();
  w = await import("@/lib/wishes");
});

const fresh = (it: Item) => t.db.get<Item>("SELECT * FROM items WHERE id = ?", it.id)!;

describe("must-haves", () => {
  it("allows three gold stars per list", () => {
    const l = t.list(t.profileOf(t.user("star")));
    const items = [1, 2, 3, 4].map((i) => t.item(l.id, `Wish ${i}`));
    for (const it of items.slice(0, 3)) expect(w.setMustHave(it, true)).toEqual({ ok: true });
    expect(w.setMustHave(items[3], true).ok).toBe(false);
    // Re-starring one that already has a star is fine.
    expect(w.setMustHave(fresh(items[0]), true).ok).toBe(true);
    expect(w.setMustHave(fresh(items[0]), false).ok).toBe(true);
    expect(w.setMustHave(items[3], true).ok).toBe(true);
    expect(w.mustHaveCount(l.id)).toBe(3);
  });
});

describe("kid-mode approvals", () => {
  it("keeps unapproved wishes out of shoppers' counts until approved", () => {
    const parent = t.user("kparent");
    const l = t.list(t.profileOf(parent, "Mia"));
    t.item(l.id, "Approved");
    const pending = t.item(l.id, "Unicorn");
    t.db.run("UPDATE items SET needs_approval = 1 WHERE id = ?", pending.id);
    expect(w.pendingApprovals(l.id)).toBe(1);
    expect(w.visibleToShoppers(fresh(pending))).toBe(false);
    expect(t.access.getList(l.id)!.item_count).toBe(1);
    w.approveItem(pending.id);
    expect(w.visibleToShoppers(fresh(pending))).toBe(true);
    expect(t.access.getList(l.id)!.item_count).toBe(2);
  });
});

describe("archive", () => {
  it("moves wishes out of the list and says who to tell", () => {
    const [kid, aunt, uncle] = ["akid", "aaunt", "auncle"].map(t.user);
    const l = t.list(t.profileOf(kid));
    const kite = t.item(l.id, "Kite");
    t.db.run("UPDATE items SET claimed_by = ?, must_have = 1 WHERE id = ?", aunt.id, kite.id);
    t.db.run("INSERT INTO pledges (item_id, user_id, amount_cents) VALUES (?, ?, 500)", kite.id, uncle.id);
    expect(w.archiveWish(fresh(kite), "unwanted").sort()).toEqual([aunt.id, uncle.id].sort());
    expect(fresh(kite)).toMatchObject({ archive_reason: "unwanted", must_have: 0 });
    expect(t.access.getList(l.id)!.item_count).toBe(0);

    const ball = t.item(l.id, "Ball");
    t.db.run("UPDATE items SET claimed_by = ?, purchased = 1 WHERE id = ?", aunt.id, ball.id);
    expect(w.archiveWish(fresh(ball), "received")).toEqual([]);

    w.restoreWish(kite.id);
    expect(fresh(kite)).toMatchObject({ archived_at: null, archive_reason: "" });
  });
});

describe("removing a wish", () => {
  it("finds everyone getting it: the claimer, people who chipped in, and buyers", () => {
    const kid = t.user("rkid");
    const [claimer, chipper, buyer, rejected] = ["rclaim", "rchip", "rbuy", "rrej"].map((n) => t.user(n));
    const l = t.list(t.profileOf(kid));
    const it = t.item(l.id, "Scooter");
    t.db.run("UPDATE items SET claimed_by = ? WHERE id = ?", claimer.id, it.id);
    t.db.run("INSERT INTO pledges (item_id, user_id, amount_cents) VALUES (?, ?, 500)", it.id, chipper.id);
    t.db.run("INSERT INTO pledges (item_id, user_id, amount_cents) VALUES (?, ?, 300)", it.id, claimer.id);
    for (const [u, status] of [[buyer, "confirmed"], [rejected, "rejected"]] as const) {
      t.db.run("INSERT INTO purchases (item_id, list_id, item_title, buyer_user_id, buyer_name, status) VALUES (?, ?, 'Scooter', ?, ?, ?)", it.id, l.id, u.id, u.name, status);
    }
    expect(w.peopleBuying(fresh(it)).sort()).toEqual([claimer.id, chipper.id, buyer.id].sort());
  });

  it("is empty when nobody planned to get it", () => {
    const l = t.list(t.profileOf(t.user("rnobody")));
    expect(w.peopleBuying(t.item(l.id))).toEqual([]);
  });
});
