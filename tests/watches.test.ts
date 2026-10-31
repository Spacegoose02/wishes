import { beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type * as Watches from "@/lib/watches";

let t: Awaited<ReturnType<typeof testDb>>;
let w: typeof Watches;

beforeAll(async () => {
  t = await testDb();
  w = await import("@/lib/watches");
});

describe("price watches", () => {
  it("alerts each watcher once when their target is reached", () => {
    const [kid, aunt, uncle] = ["wkid", "waunt", "wuncle"].map(t.user);
    const l = t.list(t.profileOf(kid));
    const lego = t.item(l.id, "LEGO", 6000);
    w.setWatch(aunt.id, lego.id, 5000);
    w.setWatch(uncle.id, lego.id, 4000);
    expect(w.watchesFor(aunt.id, l.id).get(lego.id)).toBe(5000);

    expect(w.checkWatches(lego.id, 5500)).toEqual([]);
    expect(w.checkWatches(lego.id, 4900)).toEqual([aunt.id]);
    expect(t.notes(aunt)).toEqual(["🎯 LEGO hit your target: $49.00 (you wanted $50.00 or less)"]);
    // Already told; the uncle's target isn't met yet.
    expect(w.checkWatches(lego.id, 4800)).toEqual([]);
    expect(w.checkWatches(lego.id, 3900)).toEqual([uncle.id]);

    // A new target re-arms the alert; clearing removes the watch.
    w.setWatch(aunt.id, lego.id, 4000);
    expect(w.checkWatches(lego.id, 3900)).toEqual([aunt.id]);
    w.setWatch(aunt.id, lego.id, null);
    expect(w.watchesFor(aunt.id, l.id).size).toBe(0);
  });

  it("stays quiet once the wish is bought", () => {
    const l = t.list(t.profileOf(t.user("wbought")));
    const it1 = t.item(l.id, "Hat", 2000);
    w.setWatch(t.user("wwatcher").id, it1.id, 1500);
    t.db.run("UPDATE items SET purchased = 1 WHERE id = ?", it1.id);
    expect(w.checkWatches(it1.id, 1000)).toEqual([]);
  });
});
