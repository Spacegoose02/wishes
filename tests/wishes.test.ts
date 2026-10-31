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
