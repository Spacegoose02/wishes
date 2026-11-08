import { beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type * as Questions from "@/lib/questions";

let t: Awaited<ReturnType<typeof testDb>>;
let q: typeof Questions;

beforeAll(async () => {
  t = await testDb();
  q = await import("@/lib/questions");
});

describe("questions about a wish", () => {
  it("reach the list's person without the asker's name, and the answer reaches the asker", () => {
    const me = t.user("asked");
    const aunt = t.user("Aunt Jo");
    const l = t.list(t.profileOf(me));
    const it1 = t.item(l.id, "Hoodie");
    const id = q.askQuestion(it1, l, aunt.id, "Which size?")!;
    expect(id).toBeGreaterThan(0);
    const note = t.notes(me).at(-1)!;
    expect(note).toContain("Which size?");
    expect(note).not.toContain("Aunt Jo");
    expect(q.openQuestions(l.id)).toBe(1);

    expect(q.answerQuestion(id, l, "Large")).toBe(true);
    expect(t.notes(aunt).at(-1)).toContain("Large");
    expect(q.openQuestions(l.id)).toBe(0);
    const shown = q.questionsForList(l.id, aunt.id).get(it1.id)!;
    expect(shown[0]).toMatchObject({ question: "Which size?", answer: "Large", mine: 1 });
    expect(q.questionsForList(l.id, me.id).get(it1.id)![0].mine).toBe(0);
  });

  it("can't be asked by the list's own person, about surprises, or empty", () => {
    const me = t.user("selfask");
    const l = t.list(t.profileOf(me));
    const it1 = t.item(l.id);
    expect(q.askQuestion(it1, l, me.id, "Hmm?")).toBeNull();
    expect(q.askQuestion({ ...it1, surprise: 1 }, l, t.user("x").id, "Hmm?")).toBeNull();
    expect(q.askQuestion(it1, l, t.user("y").id, "   ")).toBeNull();
  });

  it("only answers questions on the same list", () => {
    const a = t.user("lista");
    const la = t.list(t.profileOf(a));
    const lb = t.list(t.profileOf(t.user("listb")));
    const id = q.askQuestion(t.item(la.id), la, t.user("z").id, "Color?")!;
    expect(q.answerQuestion(id, lb, "Red")).toBe(false);
    expect(q.questionOnList(id, lb.id)).toBeUndefined();
    expect(q.questionOnList(id, la.id)).toBeDefined();
  });
});
