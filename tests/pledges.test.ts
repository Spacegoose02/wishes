import { beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type * as Pledges from "@/lib/pledges";

let t: Awaited<ReturnType<typeof testDb>>;
let pl: typeof Pledges;

beforeAll(async () => {
  t = await testDb();
  pl = await import("@/lib/pledges");
});

describe("pledgeProgress", () => {
  it("adds up pledges against the goal", () => {
    expect(pl.pledgeProgress(5000, [{ amount_cents: 1000 }, { amount_cents: 1500 }])).toEqual({ goal: 5000, total: 2500, remaining: 2500, pct: 50, full: false });
  });
  it("caps the bar at 100% and handles no price", () => {
    expect(pl.pledgeProgress(1000, [{ amount_cents: 1200 }])).toMatchObject({ pct: 100, full: true, remaining: 0 });
    expect(pl.pledgeProgress(0, [])).toMatchObject({ pct: 0, full: false });
  });
  it("aims for price times quantity", () => {
    expect(pl.pledgeGoal({ price_cents: 2500, quantity: 2 })).toBe(5000);
    expect(pl.pledgeGoal({ price_cents: null, quantity: 1 })).toBe(0);
  });
});

describe("setPledge", () => {
  it("records, updates, caps and withdraws pledges", () => {
    const [kid, aunt, uncle] = ["kid", "aunt", "uncle"].map(t.user);
    const it1 = t.item(t.list(t.profileOf(kid)).id, "Bike", 10000);

    expect(pl.setPledge(it1, aunt.id, 4000)).toMatchObject({ amount: 4000, justFunded: false });
    expect(pl.setPledge(it1, aunt.id, 5000).amount).toBe(5000);
    // The second shopper can only cover what's left, and that funds it.
    const r = pl.setPledge(it1, uncle.id, 9000);
    expect(r).toMatchObject({ amount: 5000, justFunded: true, progress: { full: true } });
    expect(pl.pledgers(it1.id).sort()).toEqual([aunt.id, uncle.id].sort());
    // Updating while already full isn't "just funded" again.
    expect(pl.setPledge(it1, uncle.id, 5000).justFunded).toBe(false);

    expect(pl.setPledge(it1, aunt.id, 0).amount).toBe(0);
    expect(pl.pledgesForList(it1.list_id).map((p) => p.name)).toEqual(["uncle"]);
  });
});
