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
