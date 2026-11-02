import { beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type * as GiftChat from "@/lib/giftchat";
import type { Profile } from "@/lib/types";

let t: Awaited<ReturnType<typeof testDb>>;
let gc: typeof GiftChat;

beforeAll(async () => {
  t = await testDb();
  gc = await import("@/lib/giftchat");
});

describe("Baxter for givers", () => {
  it("knows unclaimed wishes and the shopper's budget, but tells the recipient nothing", () => {
    const [kid, aunt, uncle] = ["gkid", "gaunt", "guncle"].map(t.user);
    t.family("GFam", kid, aunt, uncle);
    const pid = t.profileOf(kid);
    const l = t.list(pid, { occasion: "Birthday" });
    t.item(l.id, "Kite", 2500);
    const claimed = t.item(l.id, "Secret Drum", 4000);
    t.db.run("UPDATE items SET claimed_by = ? WHERE id = ?", uncle.id, claimed.id);
    const pending = t.item(l.id, "Unapproved Pony");
    t.db.run("UPDATE items SET needs_approval = 1 WHERE id = ?", pending.id);
    t.db.run("INSERT INTO budgets (user_id, profile_id, occasion, year, amount_cents) VALUES (?, ?, '', ?, 5000)", aunt.id, pid, new Date().getFullYear());

    const ctx = gc.giverContext(aunt, l);
    expect(ctx.unclaimed.map((i) => i.title)).toEqual(["Kite"]);
    expect(ctx.budget).toMatchObject({ amount_cents: 5000, left_cents: 5000 });

    const profile = t.db.get<Profile>("SELECT * FROM profiles WHERE id = ?", pid)!;
    const giverPrompt = gc.systemPrompt(l, profile, "gaunt", false, ctx);
    expect(giverPrompt).toContain("nobody has picked yet");
    expect(giverPrompt).toContain("$50.00 left");
    expect(giverPrompt).not.toContain("Unapproved Pony");

    // The recipient's prompt never includes the giver brief, even if one is passed by mistake.
    const own = gc.systemPrompt(l, profile, "gkid", true, ctx);
    expect(own).not.toContain("nobody has picked yet");
    expect(own).not.toContain("$50.00");
  });
});

describe("Baxter reads the About card", () => {
  it("puts a kid's likes, dislikes, sizes and notes in the prompt", () => {
    const mom = t.user("amom");
    const pid = t.profileOf(mom, "Ava");
    t.db.run(
      "UPDATE profiles SET age = 7, likes = 'Dinosaurs, Bluey', dislikes = 'Slime', sizes = ?, gift_notes = 'Allergic to latex' WHERE id = ?",
      JSON.stringify({ shirt: "Kids M (8)" }), pid,
    );
    const l = t.list(pid);
    const prompt = gc.chatContext(l, t.access.listProfile(pid)!, "amom", false);
    expect(prompt).toContain("Age: 7");
    expect(prompt).toContain("Dinosaurs, Bluey");
    expect(prompt).toContain("Slime");
    expect(prompt).toContain("Shirt Kids M (8)");
    expect(prompt).toContain("Allergic to latex");
  });

  it("fills a secret list's stand-in profile from the kid's own profile", () => {
    const [kid, dad] = ["skid", "sdad"].map(t.user);
    t.db.run("UPDATE profiles SET age = 10, likes = 'Minecraft', gift_notes = 'Saving for a bike' WHERE id = ?", t.profileOf(kid));
    const standIn = Number(
      t.db.run("INSERT INTO profiles (user_id, name, linked_user_id) VALUES (?, 'skid', ?)", dad.id, kid.id).lastInsertRowid,
    );
    t.db.run("UPDATE profiles SET dislikes = 'Puzzles' WHERE id = ?", standIn);
    const p = t.access.listProfile(standIn)!;
    expect(p).toMatchObject({ id: standIn, age: 10, likes: "Minecraft", dislikes: "Puzzles", gift_notes: "Saving for a bike" });
    const prompt = gc.chatContext(t.list(standIn), p, "sdad", false);
    expect(prompt).toContain("Minecraft");
    expect(prompt).toContain("Puzzles");
  });
});
