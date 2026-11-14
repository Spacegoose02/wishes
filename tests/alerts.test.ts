import { beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type * as Notify from "@/lib/notify";
import type * as Push from "@/lib/push";

let t: Awaited<ReturnType<typeof testDb>>;
let nt: typeof Notify;
let push: typeof Push;

beforeAll(async () => {
  t = await testDb();
  nt = await import("@/lib/notify");
  push = await import("@/lib/push");
});

describe("alerts", () => {
  it("keeps email subjects to one short line", () => {
    expect(nt.emailSubject("Price drop:\nLEGO set")).toBe("Wishes: Price drop: LEGO set");
    expect(nt.emailSubject("x".repeat(200)).length).toBeLessThanOrEqual(80);
  });

  it("escapes the message in the email's HTML", () => {
    const b = nt.emailBody("Sam", `<script>alert("hi")</script>`, "https://wishes.example/lists/1");
    expect(b.html).not.toContain("<script>");
    expect(b.html).toContain("&lt;script&gt;");
    expect(b.text).toContain("https://wishes.example/lists/1");
  });

  it("folds repeated alerts into one unread alert", () => {
    const u = t.user("folder");
    nt.notifyOnce(u.id, "new_wishes", "/lists/9", (n) => `${n} new`);
    nt.notifyOnce(u.id, "new_wishes", "/lists/9", (n) => `${n} new`);
    nt.notifyOnce(u.id, "new_wishes", "/lists/10", (n) => `${n} new`);
    expect(t.notes(u)).toEqual(["2 new", "1 new"]);
    t.db.run("UPDATE notifications SET read = 1 WHERE user_id = ?", u.id);
    nt.notifyOnce(u.id, "new_wishes", "/lists/9", (n) => `${n} new`);
    expect(t.notes(u)).toEqual(["2 new", "1 new", "1 new"]);
  });

  it("only accepts subscriptions from real push services", () => {
    const keys = { p256dh: "BNc", auth: "abc" };
    expect(push.validSubscription({ endpoint: "https://fcm.googleapis.com/fcm/send/xyz", keys })).not.toBeNull();
    expect(push.validSubscription({ endpoint: "https://web.push.apple.com/abc", keys })).not.toBeNull();
    expect(push.validSubscription({ endpoint: "https://updates.push.services.mozilla.com/wpush/v2/x", keys })).not.toBeNull();
    expect(push.validSubscription({ endpoint: "http://fcm.googleapis.com/x", keys })).toBeNull();
    expect(push.validSubscription({ endpoint: "https://192.168.1.5/x", keys })).toBeNull();
    expect(push.validSubscription({ endpoint: "https://evil.example/googleapis.com", keys })).toBeNull();
    expect(push.validSubscription({ endpoint: "https://fcm.googleapis.com/x" })).toBeNull();
  });

  it("saves one row per device and moves a device to whoever signed in last", () => {
    const a = t.user("pusha");
    const b = t.user("pushb");
    const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/dev1", keys: { p256dh: "k", auth: "a" } };
    push.saveSubscription(a.id, sub);
    push.saveSubscription(a.id, sub);
    expect(push.pushDeviceCount(a.id)).toBe(1);
    push.saveSubscription(b.id, sub);
    expect(push.pushDeviceCount(a.id)).toBe(0);
    expect(push.pushDeviceCount(b.id)).toBe(1);
  });
});
