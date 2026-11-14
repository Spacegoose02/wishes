import { beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type * as Resets from "@/lib/resets";

let t: Awaited<ReturnType<typeof testDb>>;
let r: typeof Resets;

beforeAll(async () => {
  t = await testDb();
  r = await import("@/lib/resets");
});

describe("password resets", () => {
  it("works once, then not again", () => {
    const u = t.user("forgetful");
    t.db.run("INSERT INTO sessions (id, user_id, expires_at) VALUES ('s1', ?, unixepoch() + 999)", u.id);
    const token = r.createReset(u.id, 1);
    expect(r.resetUser(token)).toBe(u.id);
    expect(r.redeemReset(token, "newhash")).toBe(u.id);
    expect(t.db.get<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = ?", u.id)!.password_hash).toBe("newhash");
    expect(t.db.get("SELECT 1 FROM sessions WHERE user_id = ?", u.id)).toBeUndefined();
    expect(r.redeemReset(token, "again")).toBeUndefined();
  });

  it("expires", () => {
    const u = t.user("slowpoke");
    const now = Date.now();
    const token = r.createReset(u.id, 1, now);
    expect(r.resetUser(token, now + 59 * 60_000)).toBe(u.id);
    expect(r.resetUser(token, now + 61 * 60_000)).toBeUndefined();
  });

  it("a newer link replaces an older one, and junk tokens fail", () => {
    const u = t.user("twice");
    const first = r.createReset(u.id, 1);
    const second = r.createReset(u.id, 1);
    expect(r.resetUser(first)).toBeUndefined();
    expect(r.resetUser(second)).toBe(u.id);
    expect(r.resetUser("")).toBeUndefined();
    expect(r.resetUser("nope")).toBeUndefined();
  });
});
