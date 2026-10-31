import { beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type * as Bandit from "@/lib/bandit";
import type * as Store from "@/lib/chatstore";
import type * as GiftChat from "@/lib/giftchat";
import { estimateCost } from "@/lib/ai";

let t: Awaited<ReturnType<typeof testDb>>;
let b: typeof Bandit;
let cs: typeof Store;
let gc: typeof GiftChat;

beforeAll(async () => {
  t = await testDb();
  b = await import("@/lib/bandit");
  cs = await import("@/lib/chatstore");
  gc = await import("@/lib/giftchat");
});

const usage = { input: 1_000_000, output: 100_000, cacheRead: 0, cacheWrite: 0, webSearches: 0 };

describe("Bandit's tools", () => {
  it("turns suggest_gifts input into cards, dropping junk and capping at 8", () => {
    const gifts = [{ title: "LEGO Bonsai 10281", why: "Calm build", price: 49.99, store: "Amazon", search: "lego bonsai", category: "toys" }, { title: "  " }, null];
    const ideas = b.ideasFromTool({ gifts: [...gifts, ...Array(10).fill(gifts[0])] });
    expect(ideas).toHaveLength(8);
    expect(ideas[0]).toEqual({ title: "LEGO Bonsai 10281", why: "Calm build", price: 49.99, store: "Amazon", search: "lego bonsai", category: "toys" });
    expect(b.ideasFromTool({ gifts: [{ title: "Book", price: 0 }] })[0].price).toBeUndefined();
    expect(b.ideasFromTool("nope")).toEqual([]);
  });

  it("only offers a profile tip when something was learned", () => {
    expect(b.tipFromTool({ likes: "", dislikes: "", note: "" })).toBeUndefined();
    expect(b.tipFromTool({ likes: " birds ", dislikes: "", note: "" })).toEqual({ likes: "birds", dislikes: undefined, note: undefined });
  });

  it("replays earlier cards as a note so Bandit remembers them", () => {
    expect(b.replayTurn("Try these!", [{ title: "Kite", why: "" }, { title: "Yo-yo", why: "" }])).toBe("Try these!\n\n[Shown to the shopper as gift cards: Kite; Yo-yo]");
    expect(b.replayTurn("Hi", [])).toBe("Hi");
  });

  it("trims long chats in blocks and starts on a shopper's message", () => {
    const turns = Array.from({ length: 260 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", i }));
    expect(b.historyWindow(turns.slice(0, 200))).toHaveLength(200);
    const w = b.historyWindow(turns);
    expect(w[0]).toEqual({ role: "user", i: 100 });
    // The start only moves every 50 messages, so the cached prefix stays put in between.
    expect(b.historyWindow(turns.slice(0, 249))[0]).toEqual({ role: "user", i: 50 });
  });
});

describe("cost estimates", () => {
  it("prices tokens by model, counting cache writes at 1.25x and searches at 1¢", () => {
    expect(estimateCost("claude-opus-5-5", usage)).toBeCloseTo(4 + 2);
    expect(estimateCost("claude-sonnet-5-5", { ...usage, cacheWrite: 1_000_000, webSearches: 3 })).toBeCloseTo(2 + 1 + 2.5 + 0.03);
    expect(estimateCost("something-else", usage)).toBe(estimateCost("claude-opus-5-5", usage));
  });
});

describe("chat store", () => {
  it("saves replies with their cards and usage, and adds them up for the month", () => {
    const u = t.user("chatter");
    const l = t.list(t.profileOf(u));
    cs.addUserMessage(l.id, u.id, "Ideas?");
    const id = cs.addAssistantMessage(l.id, u.id, { text: "A kite!", ideas: [{ title: "Kite", why: "Windy" }], tip: { likes: "wind" }, model: "claude-opus-5-5", usage });
    cs.addAssistantMessage(l.id, u.id, { text: "Half a tho", ideas: [], stopped: true, model: "", usage: { ...usage, input: 0, output: 0 } });
    const views = cs.chatViews(l.id, u.id);
    expect(views.map((v) => v.role)).toEqual(["user", "assistant", "assistant"]);
    expect(cs.chatView(id)).toMatchObject({ body: "A kite!", ideas: [{ title: "Kite" }], tip: { likes: "wind" } });
    expect(views[2].stopped).toBe(true);
    expect(cs.sentToday(u.id)).toBe(1);
    const m = cs.monthUsage();
    expect(m.replies).toBe(1);
    expect(m.cost).toBeCloseTo(6);
  });

  it("still reads replies saved in the old fenced format", () => {
    const u = t.user("oldchat");
    const l = t.list(t.profileOf(u));
    t.db.run("INSERT INTO chat_messages (list_id, user_id, role, content) VALUES (?, ?, 'assistant', ?)", l.id, u.id, 'Try this\n```gifts\n[{"title":"Kite","why":"Windy"}]\n```');
    expect(cs.chatViews(l.id, u.id)[0]).toMatchObject({ body: "Try this", ideas: [{ title: "Kite" }] });
  });

  it("reads the daily limit setting, falling back to 100", () => {
    expect(cs.dailyCap()).toBe(100);
    t.db.setSetting("chat_daily_cap", "0");
    expect(cs.dailyCap()).toBe(0);
    t.db.setSetting("chat_daily_cap", "lots");
    expect(cs.dailyCap()).toBe(100);
  });
});

describe("starters", () => {
  it("shape the opening suggestions around the person", () => {
    expect(gc.chatStarters({ name: "Mia", likes: "dinosaurs, art", age: 7 }, false, 4200)).toEqual([
      "Ideas for someone who loves dinosaurs", "What fits my $42 left?", "What's popular for 7-year-olds right now?", "Something that isn't more stuff",
    ]);
    expect(gc.chatStarters({ name: "Sam", likes: "", age: null }, false)[0]).toBe("What would Sam love this year?");
    expect(gc.chatStarters({ name: "Me", likes: "x", age: 30 }, true)[0]).toMatch(/my list/);
  });
});
