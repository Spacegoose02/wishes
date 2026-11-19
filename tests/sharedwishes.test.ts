import { beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type * as Shared from "@/lib/sharedwishes";

let t: Awaited<ReturnType<typeof testDb>>;
let sh: typeof Shared;

beforeAll(async () => {
  t = await testDb();
  sh = await import("@/lib/sharedwishes");
});

function siblings(tag: string) {
  const parent = t.user(`${tag}parent`);
  const leo = t.list(t.profileOf(parent, `Leo${tag}`));
  const mia = t.list(t.profileOf(parent, `Mia${tag}`));
  return { parent, leo, mia };
}

describe("shared wishes", () => {
  it("offers the siblings' lists, not the same kid or the parent's own list", () => {
    const { parent, leo, mia } = siblings("a");
    t.list(leo.profile_id); // Leo's other list
    t.list(t.profileOf(parent)); // the parent's own list
    expect(sh.shareTargets(parent.id, leo).map((l) => l.id)).toEqual([mia.id]);
  });

  it("shows one wish on both lists, with one claim for both", () => {
    const { parent, leo, mia } = siblings("b");
    const tramp = t.item(leo.id, "Trampoline");
    expect(sh.setShares(tramp, [mia.id], parent.id)).toBe(1);
    expect(sh.sharedInto(mia.id).map((i) => i.id)).toEqual([tramp.id]);
    expect(sh.sharedInto(leo.id)).toEqual([]);
    const people = sh.sharePeople([tramp.id]).get(tramp.id)!;
    expect(people.map((p) => p.list_id)).toEqual([leo.id, mia.id]);
    expect(sh.sharedWithLabel(people, leo.profile_id)).toBe("Miab");
    expect(sh.sharedWithLabel(people, mia.profile_id)).toBe("Leob");

    // Claiming is on the one wish, so it reads as claimed wherever it shows.
    const aunt = t.user("bAunt");
    t.db.run("UPDATE items SET claimed_by = ? WHERE id = ?", aunt.id, tramp.id);
    expect(sh.sharedInto(mia.id)[0].claimed_by).toBe(aunt.id);
  });

  it("refuses lists the user doesn't manage, the same kid, and surprises", () => {
    const { parent, leo, mia } = siblings("c");
    const stranger = siblings("cc");
    const ball = t.item(leo.id, "Ball");
    expect(sh.setShares(ball, [stranger.mia.id, leo.id, t.list(leo.profile_id).id], parent.id)).toBe(0);
    const surprise = { ...t.item(leo.id, "Secret"), surprise: 1 };
    expect(sh.setShares(surprise, [mia.id], parent.id)).toBe(0);
    expect(sh.sharePeople([ball.id, surprise.id]).size).toBe(0);
  });

  it("can share with more than one sibling, and unshare", () => {
    const { parent, leo, mia } = siblings("d");
    const ava = t.list(t.profileOf(parent, "Ava"));
    const pool = t.item(leo.id, "Pool");
    expect(sh.setShares(pool, [mia.id, ava.id], parent.id)).toBe(2);
    expect(sh.sharedWithLabel(sh.sharePeople([pool.id]).get(pool.id)!, leo.profile_id)).toBe("Miad & Ava");
    expect(sh.setShares(pool, [ava.id], parent.id)).toBe(1);
    expect(sh.sharedListIds(pool.id)).toEqual([ava.id]);
    sh.unshare(pool.id, ava.id);
    expect(sh.sharedListIds(pool.id)).toEqual([]);
  });

  it("keeps a shared wish's claims secret from a sibling with their own login", () => {
    const parent = t.user("eparent");
    const teen = t.user("eteen");
    const teenList = t.list(t.profileOf(teen));
    t.db.run("INSERT INTO list_owners (list_id, user_id) VALUES (?, ?)", teenList.id, parent.id);
    const kid = t.list(t.profileOf(parent, "Kide"));
    const game = t.item(kid.id, "Game console");
    expect(sh.setShares(game, [teenList.id], parent.id)).toBe(1);
    expect(sh.sharedWithUser(game.id, teen.id)).toBe(true);
    expect(sh.sharedWithUser(game.id, parent.id)).toBe(false);
    expect(sh.isForUser(sh.sharePeople([game.id]).get(game.id), teen.id)).toBe(true);
  });

  it("drops the share when the wish or list goes away, and hides archived wishes", () => {
    const { parent, leo, mia } = siblings("f");
    const bike = t.item(leo.id, "Tandem bike");
    sh.setShares(bike, [mia.id], parent.id);
    t.db.run("UPDATE items SET archived_at = unixepoch() WHERE id = ?", bike.id);
    expect(sh.sharedInto(mia.id)).toEqual([]);
    t.db.run("DELETE FROM items WHERE id = ?", bike.id);
    expect(sh.sharedListIds(bike.id)).toEqual([]);
  });
});
