import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Item, User } from "@/lib/types";

// A throwaway database plus small builders for people, families, lists and wishes.
// Call once per test file (in beforeAll) before importing anything that touches the db.
export async function testDb() {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "wishes-test-"));
  const db = await import("@/lib/db");
  const access = await import("@/lib/access");

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
    const id = Number(db.run("INSERT INTO families (name, invite_code) VALUES (?, ?)", name, `${name}-${Math.random()}`).lastInsertRowid);
    for (const m of members) db.run("INSERT INTO family_members (family_id, user_id) VALUES (?, ?)", id, m.id);
    return id;
  }
  function list(profileId: number, opts: { eventDate?: string | null; occasion?: string } = {}) {
    const id = Number(
      db.run("INSERT INTO lists (profile_id, title, event_date, occasion) VALUES (?, 'List', ?, ?)", profileId, opts.eventDate ?? null, opts.occasion ?? "").lastInsertRowid,
    );
    return access.getList(id)!;
  }
  function item(listId: number, title = "Thing", priceCents: number | null = 1000): Item {
    const id = Number(db.run("INSERT INTO items (list_id, title, price_cents) VALUES (?, ?, ?)", listId, title, priceCents).lastInsertRowid);
    return db.get<Item>("SELECT * FROM items WHERE id = ?", id)!;
  }
  function notes(u: User): string[] {
    return db.all<{ message: string }>("SELECT message FROM notifications WHERE user_id = ? ORDER BY id", u.id).map((r) => r.message);
  }
  return { db, access, user, profileOf, family, list, item, notes };
}
