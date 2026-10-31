import { beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type * as Reminders from "@/lib/reminders";

let t: Awaited<ReturnType<typeof testDb>>;
let rm: typeof Reminders;

beforeAll(async () => {
  t = await testDb();
  rm = await import("@/lib/reminders");
});

const at = (d: string) => new Date(d + "T10:00:00").getTime();

describe("event reminders", () => {
  it("nudges shoppers a week out, once, and never the list's own person", () => {
    const [bday, idle, claimer, buyer, outsider] = ["rbday", "ridle", "rclaim", "rbuy", "rout"].map(t.user);
    t.family("RemFam", bday, idle, claimer, buyer);
    const l = t.list(t.profileOf(bday), { eventDate: "2026-11-05", occasion: "birthday" });
    const kite = t.item(l.id, "Kite");
    const drum = t.item(l.id, "Drum");
    t.db.run("UPDATE items SET claimed_by = ? WHERE id = ?", claimer.id, kite.id);
    t.db.run("UPDATE items SET claimed_by = ?, purchased = 1 WHERE id = ?", buyer.id, drum.id);
    t.db.run("INSERT INTO purchases (item_id, list_id, item_title, buyer_user_id, buyer_name) VALUES (?, ?, 'Drum', ?, 'rbuy')", drum.id, l.id, buyer.id);

    // Too early: nothing.
    expect(rm.sendEventReminders(at("2026-10-20"))).toBe(0);
    expect(rm.sendEventReminders(at("2026-10-30"))).toBe(2);
    expect(t.notes(idle)).toEqual(["rbday's birthday is in 6 days and you haven't picked a gift yet."]);
    expect(t.notes(claimer)).toEqual(["rbday's birthday is in 6 days. You're getting Kite; mark it bought once you have it."]);
    expect(t.notes(buyer)).toEqual([]);
    expect(t.notes(bday)).toEqual([]);
    expect(t.notes(outsider)).toEqual([]);
    // Already done for this date.
    expect(rm.sendEventReminders(at("2026-10-31"))).toBe(0);
    // A new date (e.g. rolled to next year) gets its own reminder.
    t.db.run("UPDATE lists SET event_date = '2027-11-05' WHERE id = ?", l.id);
    expect(rm.sendEventReminders(at("2027-11-01"))).toBe(2);
  });
});
