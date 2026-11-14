import { beforeAll, describe, expect, it } from "vitest";
import { testDb } from "./helpers";
import type * as Tokens from "@/lib/apitokens";
import type * as Api from "@/lib/api";
import type { Item } from "@/lib/types";

let t: Awaited<ReturnType<typeof testDb>>;
let tok: typeof Tokens;
let api: typeof Api;
const ORIGIN = "https://wishes.test";

beforeAll(async () => {
  t = await testDb();
  tok = await import("@/lib/apitokens");
  api = await import("@/lib/api");
});

const bearer = (token: string) => `Bearer ${token}`;

describe("API keys", () => {
  it("work until revoked, and only the hash is stored", () => {
    const u = t.user("keymaker");
    const r = tok.createApiToken(u.id, "Den Duty");
    if (!r.ok) throw new Error(r.error);
    expect(r.token.startsWith("wsh_")).toBe(true);
    expect(t.db.get("SELECT 1 FROM api_tokens WHERE token_hash = ?", r.token)).toBeUndefined();
    const who = tok.apiCaller(bearer(r.token));
    expect(who?.user.id).toBe(u.id);
    expect(who?.tokenName).toBe("Den Duty");
    expect(tok.listApiTokens(u.id)[0].last_used_at).not.toBeNull();
    expect(tok.revokeApiToken(u.id, r.id)).toBe(true);
    expect(tok.apiCaller(bearer(r.token))).toBeUndefined();
  });

  it("rejects junk headers, nameless keys, and someone else's revoke", () => {
    const u = t.user("careful");
    const other = t.user("sneaky");
    expect(tok.createApiToken(u.id, "  ").ok).toBe(false);
    const r = tok.createApiToken(u.id, "App");
    if (!r.ok) throw new Error(r.error);
    expect(tok.revokeApiToken(other.id, r.id)).toBe(false);
    for (const h of [null, "", r.token, "Basic abc", "Bearer wsh_nope", `Bearer ${r.token.slice(4)}`]) {
      expect(tok.apiCaller(h)).toBeUndefined();
    }
  });
});

describe("adding wishes from another app", () => {
  it("lists the kids a parent can add for, including family kids but not secret stand-ins", () => {
    const mom = t.user("mom1");
    const dad = t.user("dad1");
    t.family("fam1", mom, dad);
    const ava = t.profileOf(mom, "Ava");
    const ben = t.profileOf(dad, "Ben");
    t.db.run("INSERT INTO profiles (user_id, name, is_primary, linked_user_id) VALUES (?, 'Dad (secret)', 0, ?)", mom.id, dad.id);
    t.list(ava, { eventDate: "2001-01-01" });
    const upcoming = t.list(ava, { eventDate: "2999-12-25" });
    const kids = api.apiKids(mom);
    const names = kids.map((k) => k.name);
    expect(names).toEqual(expect.arrayContaining(["mom1", "Ava", "Ben"]));
    expect(names).not.toContain("Dad (secret)");
    const a = kids.find((k) => k.profile_id === ava)!;
    expect(a.is_kid).toBe(true);
    expect(a.default_list_id).toBe(upcoming.id);
    expect(kids.find((k) => k.profile_id === ben)!.lists).toEqual([]);
  });

  it("adds a wish by kid name that waits for a parent, and tells the parent", () => {
    const mom = t.user("mom2");
    const kid = t.profileOf(mom, "Cleo");
    const list = t.list(kid);
    const r = api.apiAddWish(mom, "Den Duty", { kid: "cleo", title: "Light-up sneakers", notes: "size 1", price_cents: 3999 }, ORIGIN);
    expect(r.status).toBe(201);
    const wish = r.body.wish as { id: number; list_id: number; needs_approval: boolean; link: string };
    expect(wish.list_id).toBe(list.id);
    expect(wish.needs_approval).toBe(true);
    expect(wish.link).toBe(`${ORIGIN}/lists/${list.id}#item-${wish.id}`);
    const item = t.db.get<Item>("SELECT * FROM items WHERE id = ?", wish.id)!;
    expect(item.category).toBe("clothes");
    expect(item.created_by_guest).toBe("Den Duty");
    expect(item.added_by).toBe(mom.id);
    expect(t.notes(mom).at(-1)).toContain("Cleo wished for Light-up sneakers (from Den Duty)");
  });

  it("skips the approval step when the caller says a grown-up already said yes", () => {
    const mom = t.user("mom3");
    const kid = t.profileOf(mom, "Dex");
    t.list(kid);
    const r = api.apiAddWish(mom, "Den Duty", { profile_id: kid, title: "Lego set", approved: true }, ORIGIN);
    expect(r.status).toBe(201);
    expect((r.body.wish as { needs_approval: boolean }).needs_approval).toBe(false);
  });

  it("returns the wish already there when the same thing is sent twice", () => {
    const mom = t.user("mom4");
    const kid = t.profileOf(mom, "Eli");
    const list = t.list(kid);
    const first = api.apiAddWish(mom, "App", { list_id: list.id, title: "Kite" }, ORIGIN);
    const again = api.apiAddWish(mom, "App", { list_id: list.id, title: " kite " }, ORIGIN);
    expect(again.status).toBe(200);
    expect(again.body.duplicate).toBe(true);
    expect((again.body.wish as { id: number }).id).toBe((first.body.wish as { id: number }).id);
    expect(t.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM items WHERE list_id = ?", list.id)!.n).toBe(1);
  });

  it("refuses lists and kids outside the key owner's families", () => {
    const mom = t.user("mom5");
    const stranger = t.user("stranger5");
    const theirKid = t.profileOf(stranger, "Fay");
    const theirList = t.list(theirKid);
    expect(api.apiAddWish(mom, "App", { list_id: theirList.id, title: "x" }, ORIGIN).status).toBe(404);
    expect(api.apiAddWish(mom, "App", { profile_id: theirKid, title: "x" }, ORIGIN).status).toBe(404);
    expect(api.apiAddWish(mom, "App", { kid: "Fay", title: "x" }, ORIGIN).status).toBe(404);
    expect(t.db.get("SELECT 1 FROM items WHERE list_id = ?", theirList.id)).toBeUndefined();
  });

  it("explains bad requests", () => {
    const mom = t.user("mom6");
    const kid = t.profileOf(mom, "Gus");
    t.profileOf(mom, "gus");
    expect(api.apiAddWish(mom, "App", null, ORIGIN).status).toBe(400);
    expect(api.apiAddWish(mom, "App", { kid: "Gus" }, ORIGIN).status).toBe(400);
    expect(api.apiAddWish(mom, "App", { title: "Ball" }, ORIGIN).status).toBe(400);
    expect(api.apiAddWish(mom, "App", { kid: "Gus", title: "Ball" }, ORIGIN).status).toBe(409);
    const noList = api.apiAddWish(mom, "App", { profile_id: kid, title: "Ball" }, ORIGIN);
    expect(noList.status).toBe(409);
    expect(noList.body.error).toContain("doesn't have a list yet");
  });
});
