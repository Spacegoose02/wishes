import { beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type * as Shopping from "@/lib/shopping";

let t: Awaited<ReturnType<typeof testDb>>;
let sh: typeof Shopping;

beforeAll(async () => {
  t = await testDb();
  sh = await import("@/lib/shopping");
});

describe("shopping list", () => {
  it("lists claimed, unbought wishes by soonest event, only where still visible", () => {
    const [me, ann, bob] = ["me", "ann", "bob"].map(t.user);
    t.family("Fam", me, ann, bob);
    const later = t.list(t.profileOf(ann), { eventDate: "2030-06-01" });
    const sooner = t.list(t.profileOf(bob), { eventDate: "2030-01-01" });
    const undated = t.list(t.profileOf(ann));
    const claim = (listId: number, title: string) => {
      const it = t.item(listId, title);
      t.db.run("UPDATE items SET claimed_by = ? WHERE id = ?", me.id, it.id);
      return it;
    };
    claim(undated.id, "Socks");
    claim(later.id, "Kite");
    claim(sooner.id, "Drum");
    const bought = claim(sooner.id, "Bought one");
    t.db.run("INSERT INTO purchases (item_id, list_id, item_title, buyer_user_id, buyer_name) VALUES (?, ?, 'Bought one', ?, 'me')", bought.id, sooner.id, me.id);
    expect(sh.toBuy(me).map((r) => r.title)).toEqual(["Drum", "Kite", "Socks"]);

    t.db.run("UPDATE lists SET visibility = 'private' WHERE id = ?", later.id);
    expect(sh.toBuy(me).map((r) => r.title)).toEqual(["Drum", "Socks"]);
  });

  it("totals spend per person, leaving out things people got themselves", () => {
    const [giver, cat] = ["giver", "cat"].map(t.user);
    const kid = t.profileOf(giver, "Junior");
    const buy = (listId: number, cents: number, qty = 1, status = "confirmed") =>
      t.db.run("INSERT INTO purchases (list_id, item_title, buyer_user_id, buyer_name, price_cents, quantity, status) VALUES (?, 'x', ?, 'giver', ?, ?, ?)", listId, giver.id, cents, qty, status);
    const catList = t.list(t.profileOf(cat)).id;
    buy(catList, 1000, 2);
    buy(catList, 500, 1, "rejected");
    buy(t.list(kid).id, 700);
    buy(t.list(t.profileOf(giver)).id, 9999); // got it myself
    expect(sh.spendByPerson(giver.id).map((s) => [s.name, s.spent_cents, s.gifts])).toEqual([["cat", 2000, 1], ["Junior", 700, 1]]);
    expect(sh.spendByPerson(giver.id, 1999)).toEqual([]);
  });
});

describe("budgets", () => {
  it("tracks spent vs left per person and per occasion", () => {
    const [me, sis] = ["bme", "bsis"].map(t.user);
    t.family("BFam", me, sis);
    const sisP = t.profileOf(sis);
    const xmas = t.list(sisP, { occasion: "Christmas" }).id;
    const bday = t.list(sisP, { occasion: "Birthday" }).id;
    const year = new Date().getFullYear();
    expect(sh.setBudget(me.id, sisP, "", year, 10000)).toBe(true);
    expect(sh.setBudget(me.id, sisP, "christmas", year, 3000)).toBe(true);
    // Strangers' profiles aren't budgetable.
    expect(sh.setBudget(me.id, t.profileOf(t.user("bstranger")), "", year, 100)).toBe(false);
    const buy = (listId: number, cents: number) =>
      t.db.run("INSERT INTO purchases (list_id, item_title, buyer_user_id, buyer_name, price_cents) VALUES (?, 'x', ?, 'bme', ?)", listId, me.id, cents);
    buy(xmas, 4000);
    buy(bday, 1500);
    const b = sh.budgetsFor(me.id, year);
    expect(b.map((x) => [x.occasion, x.spent_cents, x.left_cents, x.over])).toEqual([
      ["", 5500, 4500, false],
      ["christmas", 4000, 0, true],
    ]);
    expect(sh.budgetLeft(me.id, sisP, "Christmas", year)!.occasion).toBe("christmas");
    expect(sh.budgetLeft(me.id, sisP, "Birthday", year)!.occasion).toBe("");
    sh.setBudget(me.id, sisP, "christmas", year, null);
    expect(sh.budgetsFor(me.id, year)).toHaveLength(1);
  });
});
