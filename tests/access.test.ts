import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type * as Access from "@/lib/access";
import type * as Db from "@/lib/db";
import type { Profile, User } from "@/lib/types";

// Each test file gets its own throwaway database.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "wishes-test-"));

let access: typeof Access;
let db: typeof Db;

function user(name: string): User {
  const id = Number(db.run("INSERT INTO users (email, name) VALUES (?, ?)", `${name}@example.com`, name).lastInsertRowid);
  db.run("INSERT INTO profiles (user_id, name, is_primary) VALUES (?, ?, 1)", id, name);
  return db.get<User>("SELECT * FROM users WHERE id = ?", id)!;
}
function profileOf(u: User, kid?: string): number {
  if (kid) return Number(db.run("INSERT INTO profiles (user_id, name, is_primary) VALUES (?, ?, 0)", u.id, kid).lastInsertRowid);
  return db.get<{ id: number }>("SELECT id FROM profiles WHERE user_id = ? AND is_primary = 1", u.id)!.id;
}
function family(name: string, ...members: User[]): number {
  const id = Number(db.run("INSERT INTO families (name, invite_code) VALUES (?, ?)", name, `${name}-CODE`).lastInsertRowid);
  for (const m of members) db.run("INSERT INTO family_members (family_id, user_id) VALUES (?, ?)", id, m.id);
  return id;
}
function list(profileId: number, visibility = "family"): Access.ListWithOwner {
  const id = Number(db.run("INSERT INTO lists (profile_id, title, visibility) VALUES (?, 'List', ?)", profileId, visibility).lastInsertRowid);
  return access.getList(id)!;
}

let mom: User, dad: User, grandma: User, stranger: User, cousin: User;
let home: number, grandparents: number;

beforeAll(async () => {
  db = await import("@/lib/db");
  access = await import("@/lib/access");
  [mom, dad, grandma, stranger, cousin] = ["mom", "dad", "grandma", "stranger", "cousin"].map(user);
  home = family("Home", mom, dad, cousin);
  grandparents = family("Grandparents", grandma);
  db.run("INSERT INTO family_links (family_a, family_b) VALUES (?, ?)", home, grandparents);
});

describe("list visibility", () => {
  it("family lists are visible to family, not strangers", () => {
    const l = list(profileOf(mom));
    expect(access.listAccess(mom, l)).toBe("owner");
    expect(access.listAccess(dad, l)).toBe("viewer");
    expect(access.listAccess(stranger, l)).toBe("none");
    // Connected families only see lists shared with them explicitly.
    expect(access.listAccess(grandma, l)).toBe("none");
  });

  it("private lists are only for their owner", () => {
    const l = list(profileOf(mom), "private");
    expect(access.listAccess(dad, l)).toBe("none");
  });

  it("custom lists reach the chosen (connected) families", () => {
    const l = list(profileOf(mom), "custom");
    db.run("INSERT INTO list_families (list_id, family_id) VALUES (?, ?)", l.id, grandparents);
    expect(access.listAccess(grandma, l)).toBe("viewer");
    expect(access.listAccess(dad, l)).toBe("none");
  });

  it("hidden people can't see a list even inside the family", () => {
    const l = list(profileOf(mom));
    db.run("INSERT INTO list_hidden_users (list_id, user_id) VALUES (?, ?)", l.id, cousin.id);
    expect(access.listAccess(cousin, l)).toBe("none");
    expect(access.sharedWithMe(cousin.id).some((x) => x.id === l.id)).toBe(false);
    expect(access.sharedWithMe(dad.id).some((x) => x.id === l.id)).toBe(true);
  });

  it("co-owners manage the list", () => {
    const l = list(profileOf(mom, "Kiddo"));
    db.run("INSERT INTO list_owners (list_id, user_id) VALUES (?, ?)", l.id, dad.id);
    expect(access.listAccess(dad, l)).toBe("owner");
    expect(access.listManagers(l)).toEqual([mom.id, dad.id]);
  });
});

describe("surprises", () => {
  it("only the person a list is for is kept from seeing claims", () => {
    const own = list(profileOf(mom));
    const kids = list(profileOf(mom, "Kid"));
    expect(access.isRecipient(mom.id, own)).toBe(true);
    expect(access.isRecipient(mom.id, kids)).toBe(false);
    expect(access.isRecipient(dad.id, own)).toBe(false);
  });
});

describe("profile editing", () => {
  it("family can edit kid profiles but not grown-ups' own", () => {
    const kid = db.get<Profile>("SELECT * FROM profiles WHERE user_id = ? AND is_primary = 0", mom.id)!;
    const momsOwn = db.get<Profile>("SELECT * FROM profiles WHERE user_id = ? AND is_primary = 1", mom.id)!;
    expect(access.canEditProfile(dad.id, kid)).toBe(true);
    expect(access.canEditProfile(stranger.id, kid)).toBe(false);
    expect(access.canEditProfile(dad.id, momsOwn)).toBe(false);
  });
});
