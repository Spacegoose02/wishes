import { beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type * as Wishes from "@/lib/wishes";
import type * as Lists from "@/lib/lists";
import type { Item } from "@/lib/types";

let t: Awaited<ReturnType<typeof testDb>>;
let w: typeof Wishes;
let lists: typeof Lists;

beforeAll(async () => {
  t = await testDb();
  w = await import("@/lib/wishes");
  lists = await import("@/lib/lists");
});

function surprise(listId: number, by: number): Item {
  const it = t.item(listId, "Secret drone");
  t.db.run("UPDATE items SET surprise = 1, added_by = ? WHERE id = ?", by, it.id);
  return t.db.get<Item>("SELECT * FROM items WHERE id = ?", it.id)!;
}

describe("surprise gifts", () => {
  it("don't show up in the list's wish count, which the person can see", () => {
    const me = t.user("bday");
    const aunt = t.user("aunt");
    const l = t.list(t.profileOf(me));
    t.item(l.id, "Real wish");
    surprise(l.id, aunt.id);
    expect(t.access.getList(l.id)!.item_count).toBe(1);
  });

  it("can't be gold-starred and don't use up a star", () => {
    const me = t.user("starry");
    const l = t.list(t.profileOf(me));
    const s = surprise(l.id, me.id);
    expect(w.setMustHave(s, true).ok).toBe(false);
    t.db.run("UPDATE items SET must_have = 1 WHERE id = ?", s.id);
    expect(w.mustHaveCount(l.id)).toBe(0);
  });

  it("are left behind when a list is copied", () => {
    const me = t.user("copier");
    const l = t.list(t.profileOf(me));
    t.item(l.id, "Keep me");
    surprise(l.id, me.id);
    const copy = lists.copyList(l, t.db.get("SELECT * FROM profiles WHERE id = ?", l.profile_id)!, "Copy", me.id);
    expect(t.db.all<{ title: string }>("SELECT title FROM items WHERE list_id = ?", copy).map((r) => r.title)).toEqual(["Keep me"]);
  });
});
