import { beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type * as Reveal from "@/lib/reveal";

let t: Awaited<ReturnType<typeof testDb>>;
let rv: typeof Reveal;

beforeAll(async () => {
  t = await testDb();
  rv = await import("@/lib/reveal");
});

const day = 86400000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

describe("revealOpen", () => {
  it("opens on the event day and after, not before", () => {
    const now = new Date("2026-12-25T15:00:00").getTime();
    expect(rv.revealOpen({ event_date: "2026-12-25" }, now)).toBe(true);
    expect(rv.revealOpen({ event_date: "2026-12-20" }, now)).toBe(true);
    expect(rv.revealOpen({ event_date: "2026-12-26" }, now)).toBe(false);
    expect(rv.revealOpen({ event_date: null }, now)).toBe(false);
  });
});

describe("thank-yous", () => {
  it("lists gifts from others and thanks each giver once", () => {
    const [kid, aunt] = ["rkid", "raunt"].map(t.user);
    const l = t.list(t.profileOf(kid), { eventDate: iso(Date.now() - 2 * day) });
    const bike = t.item(l.id, "Bike");
    const buy = (who: number | null, name: string, status = "confirmed") =>
      Number(t.db.run("INSERT INTO purchases (item_id, list_id, item_title, buyer_user_id, buyer_name, status) VALUES (?, ?, 'Bike', ?, ?, ?)", bike.id, l.id, who, name, status).lastInsertRowid);
    const fromAunt = buy(aunt.id, "raunt");
    buy(kid.id, "rkid"); // got it myself
    buy(null, "gran@example.com");
    buy(aunt.id, "raunt", "pending");

    const gifts = rv.revealGifts(l);
    expect(gifts.map((g) => g.buyer_name)).toEqual(["raunt", "gran@example.com"]);

    expect(rv.sendThanks(l, fromAunt, kid.id, "🤩", "  Love it  ")).toEqual({ ok: true, to: aunt.id });
    expect(t.notes(aunt)).toEqual([`🤩 rkid says thank you for Bike! "Love it"`]);
    expect(rv.sendThanks(l, fromAunt, kid.id, "🤩", "").ok).toBe(false);
    expect(rv.revealGifts(l)[0].thanked).toBe("🤩");
    // Guests have no account to notify.
    expect(rv.sendThanks(l, gifts[1].purchase_id, kid.id, "🙏", "").ok).toBe(false);
    expect(rv.thanksSent(kid.id)).toBe(1);
  });
});
