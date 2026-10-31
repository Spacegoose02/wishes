import "server-only";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

// Single SQLite file under DATA_DIR (mount /data in Docker / Unraid appdata).
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");

const MIGRATIONS: string[] = [
  // 1: core schema
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL,
    password_hash TEXT,
    oidc_sub TEXT UNIQUE,
    avatar TEXT NOT NULL DEFAULT 'raccoon',
    theme TEXT NOT NULL DEFAULT 'system',
    totp_secret TEXT,
    totp_enabled INTEGER NOT NULL DEFAULT 0,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pending_2fa INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER NOT NULL
  );
  -- A user owns one or more profiles (themselves, plus e.g. kids without accounts).
  CREATE TABLE profiles (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    avatar TEXT NOT NULL DEFAULT 'goose',
    is_primary INTEGER NOT NULL DEFAULT 0,
    birthday TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE families (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    invite_code TEXT NOT NULL UNIQUE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE family_members (
    family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',
    PRIMARY KEY (family_id, user_id)
  );
  -- Connected families (e.g. grandparents' household) that lists can be shared with.
  CREATE TABLE family_links (
    family_a INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    family_b INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    PRIMARY KEY (family_a, family_b)
  );
  CREATE TABLE lists (
    id INTEGER PRIMARY KEY,
    profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    emoji TEXT NOT NULL DEFAULT '🎁',
    occasion TEXT NOT NULL DEFAULT '',
    event_date TEXT,
    -- private: only owner | family: all of owner's families | custom: chosen families
    visibility TEXT NOT NULL DEFAULT 'family',
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE list_families (
    list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    PRIMARY KEY (list_id, family_id)
  );
  CREATE TABLE list_hidden_users (
    list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (list_id, user_id)
  );
  -- Whitelisted emails that can edit through a secret link, no account needed.
  CREATE TABLE list_guests (
    id INTEGER PRIMARY KEY,
    list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    email TEXT NOT NULL COLLATE NOCASE,
    token TEXT NOT NULL UNIQUE,
    can_edit INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE (list_id, email)
  );
  CREATE TABLE items (
    id INTEGER PRIMARY KEY,
    list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    url TEXT NOT NULL DEFAULT '',
    store TEXT NOT NULL DEFAULT '',
    price_cents INTEGER,
    currency TEXT NOT NULL DEFAULT 'USD',
    image_url TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    priority INTEGER NOT NULL DEFAULT 2,
    quantity INTEGER NOT NULL DEFAULT 1,
    claimed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    claimed_name TEXT,
    purchased INTEGER NOT NULL DEFAULT 0,
    price_checked_at INTEGER,
    created_by_guest TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE price_history (
    id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    price_cents INTEGER NOT NULL,
    store TEXT NOT NULL DEFAULT '',
    checked_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  -- AI ideas land here for review; nothing is auto-added to a list.
  CREATE TABLE suggestions (
    id INTEGER PRIMARY KEY,
    list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    est_price_cents INTEGER,
    source TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE notifications (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT NOT NULL DEFAULT '',
    read INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE INDEX idx_items_list ON items(list_id);
  CREATE INDEX idx_lists_profile ON lists(profile_id);
  CREATE INDEX idx_notifications_user ON notifications(user_id, read);
  `,
  // 2: item details & categories, co-owners, purchases with review, avatar unlocks
  `
  ALTER TABLE items ADD COLUMN category TEXT NOT NULL DEFAULT '';
  ALTER TABLE items ADD COLUMN variant TEXT NOT NULL DEFAULT '';
  ALTER TABLE items ADD COLUMN color TEXT NOT NULL DEFAULT '';
  ALTER TABLE items ADD COLUMN size TEXT NOT NULL DEFAULT '';
  ALTER TABLE suggestions ADD COLUMN store TEXT NOT NULL DEFAULT '';
  ALTER TABLE suggestions ADD COLUMN category TEXT NOT NULL DEFAULT '';
  ALTER TABLE lists ADD COLUMN review_purchases INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE users ADD COLUMN unlocked_avatars TEXT NOT NULL DEFAULT '';
  -- Extra people who can manage a list besides the profile's owner.
  CREATE TABLE list_owners (
    list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (list_id, user_id)
  );
  CREATE TABLE purchases (
    id INTEGER PRIMARY KEY,
    item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
    list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    item_title TEXT NOT NULL,
    buyer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    buyer_name TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    price_cents INTEGER,
    store TEXT NOT NULL DEFAULT '',
    note TEXT NOT NULL DEFAULT '',
    -- confirmed | pending (waiting for a list manager) | rejected
    status TEXT NOT NULL DEFAULT 'confirmed',
    reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX idx_purchases_list ON purchases(list_id);
  CREATE INDEX idx_purchases_item ON purchases(item_id);
  -- Carry over items already marked bought.
  INSERT INTO purchases (item_id, list_id, item_title, buyer_user_id, buyer_name, quantity, price_cents, store)
    SELECT id, list_id, title, claimed_by, COALESCE(claimed_name, 'Someone'), quantity, price_cents, store
    FROM items WHERE purchased = 1;
  `,
  // 3: cross-store offers and product details for AI ideas
  `
  CREATE TABLE offers (
    id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    store TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    price_cents INTEGER NOT NULL,
    image_url TEXT NOT NULL DEFAULT '',
    score REAL NOT NULL DEFAULT 0,
    ai_checked INTEGER NOT NULL DEFAULT 0,
    checked_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX idx_offers_item ON offers(item_id);
  ALTER TABLE items ADD COLUMN offers_checked_at INTEGER;
  ALTER TABLE suggestions ADD COLUMN image_url TEXT NOT NULL DEFAULT '';
  `,
  // 4: a profile you manage can stand for another member (secret idea lists for them)
  `
  ALTER TABLE profiles ADD COLUMN linked_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
  `,
  // 5: what gift-givers (and the AI) should know about a person, plus gift-chat history
  `
  ALTER TABLE profiles ADD COLUMN age INTEGER;
  ALTER TABLE profiles ADD COLUMN likes TEXT NOT NULL DEFAULT '';
  ALTER TABLE profiles ADD COLUMN dislikes TEXT NOT NULL DEFAULT '';
  ALTER TABLE profiles ADD COLUMN sizes TEXT NOT NULL DEFAULT '{}';
  ALTER TABLE profiles ADD COLUMN gift_notes TEXT NOT NULL DEFAULT '';
  CREATE TABLE chat_messages (
    id INTEGER PRIMARY KEY,
    list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  CREATE INDEX idx_chat_list_user ON chat_messages(list_id, user_id);
  `,
  // 6: group gifts (shoppers chip in toward one wish)
  `
  CREATE TABLE pledges (
    id INTEGER PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_cents INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE (item_id, user_id)
  );
  CREATE INDEX idx_pledges_item ON pledges(item_id);
  `,
  // 7: Secret Santa exchanges
  `
  CREATE TABLE exchanges (
    id INTEGER PRIMARY KEY,
    family_id INTEGER NOT NULL REFERENCES families(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    budget_cents INTEGER,
    exchange_date TEXT,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    drawn_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  -- giftee_id is who this person gives to; only they ever see it.
  CREATE TABLE exchange_people (
    exchange_id INTEGER NOT NULL REFERENCES exchanges(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    household TEXT NOT NULL DEFAULT '',
    giftee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    done INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (exchange_id, user_id)
  );
  `,
  // 8: thank-you notes after the gifts are opened
  `
  CREATE TABLE thanks (
    id INTEGER PRIMARY KEY,
    purchase_id INTEGER UNIQUE REFERENCES purchases(id) ON DELETE SET NULL,
    list_id INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
    from_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sticker TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );
  `,
  // 9: must-have gold stars (up to three per list)
  `
  ALTER TABLE items ADD COLUMN must_have INTEGER NOT NULL DEFAULT 0;
  `,
  // 10: badges and the golden rolls they earn
  `
  ALTER TABLE users ADD COLUMN badges TEXT NOT NULL DEFAULT '';
  ALTER TABLE users ADD COLUMN bonus_rolls INTEGER NOT NULL DEFAULT 0;
  `,
  // 11: wishes added in kid mode wait for a parent before shoppers see them
  `
  ALTER TABLE items ADD COLUMN needs_approval INTEGER NOT NULL DEFAULT 0;
  `,
  // 12: past gifts: wishes marked received or no longer wanted move to an archive
  `
  ALTER TABLE items ADD COLUMN archived_at INTEGER;
  ALTER TABLE items ADD COLUMN archive_reason TEXT NOT NULL DEFAULT '';
  `,
  // 13: yearly occasions roll their date forward
  `
  ALTER TABLE lists ADD COLUMN yearly INTEGER NOT NULL DEFAULT 0;
  `,
  // 14: non-product wishes (experiences, gift cards, money funds)
  `
  ALTER TABLE items ADD COLUMN kind TEXT NOT NULL DEFAULT 'product';
  `,
  // 15: secret read-only link for printouts and QR codes
  `
  ALTER TABLE lists ADD COLUMN view_token TEXT;
  CREATE UNIQUE INDEX idx_lists_view_token ON lists(view_token);
  `,
  // 16: private calendar feed
  `
  ALTER TABLE users ADD COLUMN calendar_token TEXT;
  CREATE UNIQUE INDEX idx_users_calendar_token ON users(calendar_token);
  `,
];

function open(): DatabaseSync {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(path.join(DATA_DIR, "wishes.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  const version = () => (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  if (version() < MIGRATIONS.length) {
    // IMMEDIATE takes the write lock up front, so concurrent processes migrate one at a time.
    db.exec("BEGIN IMMEDIATE");
    try {
      for (let v = version(); v < MIGRATIONS.length; v++) {
        db.exec(MIGRATIONS[v]);
        db.exec(`PRAGMA user_version = ${v + 1}`);
      }
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  return db;
}

// Opened lazily (so builds don't touch it) and reused across hot reloads in dev.
const g = globalThis as unknown as { __wishesDb?: DatabaseSync };
function conn(): DatabaseSync {
  return g.__wishesDb ?? (g.__wishesDb = open());
}

type Param = string | number | bigint | null | Uint8Array;

export function get<T>(sql: string, ...params: Param[]): T | undefined {
  return conn().prepare(sql).get(...params) as T | undefined;
}
export function all<T>(sql: string, ...params: Param[]): T[] {
  return conn().prepare(sql).all(...params) as T[];
}
export function run(sql: string, ...params: Param[]) {
  return conn().prepare(sql).run(...params);
}
export function tx<T>(fn: () => T): T {
  const db = conn();
  db.exec("BEGIN");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function getSetting(key: string): string | undefined {
  return get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key)?.value;
}
export function setSetting(key: string, value: string) {
  run(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    key,
    value,
  );
}
