import { beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type * as Santa from "@/lib/santa";

let t: Awaited<ReturnType<typeof testDb>>;
let santa: typeof Santa;

beforeAll(async () => {
  t = await testDb();
  santa = await import("@/lib/santa");
});

// Small seeded generator so failures are reproducible.
function seeded(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
}

function valid(people: Santa.DrawPerson[], pairs: Map<number, number>) {
  expect([...pairs.keys()].sort()).toEqual(people.map((p) => p.id).sort());
  expect(new Set(pairs.values()).size).toBe(people.length);
  for (const [g, r] of pairs) expect(santa.canGiveTo(people.find((p) => p.id === g)!, people.find((p) => p.id === r)!)).toBe(true);
}

describe("drawNames", () => {
  it("never pairs someone with themselves or their household", () => {
    const people = [
      { id: 1, household: "Smiths" }, { id: 2, household: "Smiths" }, { id: 3, household: "smiths" },
      { id: 4, household: "Jones" }, { id: 5, household: "Jones" }, { id: 6, household: "" }, { id: 7, household: "" },
    ];
    for (let seed = 1; seed < 200; seed++) valid(people, santa.drawNames(people, seeded(seed))!);
  });

  it("treats a blank household as just that person", () => {
    const people = [1, 2, 3].map((id) => ({ id, household: "" }));
    valid(people, santa.drawNames(people, seeded(7))!);
  });

  it("gives up when no fair draw exists", () => {
    expect(santa.drawNames([{ id: 1, household: "A" }, { id: 2, household: "A" }, { id: 3, household: "B" }])).toBeNull();
    expect(santa.drawNames([{ id: 1, household: "" }])).toBeNull();
  });
});

describe("exchanges", () => {
  it("draws, then shows each person only their own match", () => {
    const [a, b, c, d] = ["sa", "sb", "sc", "sd"].map(t.user);
    const outsider = t.user("so");
    const fam = t.family("Santas", a, b, c, d);
    const ex = Number(t.db.run("INSERT INTO exchanges (family_id, name) VALUES (?, 'Xmas')", fam).lastInsertRowid);
    santa.setParticipants(ex, [a, b, c, d, outsider].map((u) => ({ id: u.id, household: u === a || u === b ? "Home" : "" })));
    // Outsiders aren't eligible.
    expect(santa.participants(ex).map((p) => p.user_id).sort()).toEqual([a.id, b.id, c.id, d.id].sort());
    expect(santa.myMatch(ex, a.id)).toBeUndefined();

    expect(santa.runDraw(ex, seeded(3))).toEqual({ ok: true });
    const ma = santa.myMatch(ex, a.id)!;
    expect([c.id, d.id]).toContain(ma.id);
    expect(santa.myMatch(ex, outsider.id)).toBeUndefined();

    // Changing who's in clears the draw.
    santa.setParticipants(ex, [a, b, c].map((u) => ({ id: u.id, household: "" })));
    expect(santa.getExchange(ex)!.drawn_at).toBeNull();
    expect(santa.myMatch(ex, a.id)).toBeUndefined();
  });

  it("needs three people", () => {
    const [a, b] = ["ta", "tb"].map(t.user);
    const fam = t.family("Pair", a, b);
    const ex = Number(t.db.run("INSERT INTO exchanges (family_id, name) VALUES (?, 'Duo')", fam).lastInsertRowid);
    santa.setParticipants(ex, [a, b].map((u) => ({ id: u.id, household: "" })));
    expect(santa.runDraw(ex).ok).toBe(false);
  });

  it("includes connected families with their family as household", () => {
    const [a, g] = ["ca", "cg"].map(t.user);
    const home = t.family("CHome", a);
    const gp = t.family("Grandparents", g);
    t.db.run("INSERT INTO family_links (family_a, family_b) VALUES (?, ?)", home, gp);
    expect(santa.eligiblePeople(home)).toEqual([
      expect.objectContaining({ id: a.id, household: "" }),
      expect.objectContaining({ id: g.id, household: "Grandparents" }),
    ]);
  });
});
