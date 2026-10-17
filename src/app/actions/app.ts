"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { all, get, run, setSetting, tx } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/auth";
import { getList, listAccess, ownerSeesClaims, shareableFamilies } from "@/lib/access";
import { randomToken } from "@/lib/crypto";
import { fetchProduct, normalizeUrl, type ProductInfo } from "@/lib/scrape";
import { storeFromHost } from "@/lib/scrape/stores";
import { parseMoney, ageFrom } from "@/lib/format";
import { generateIdeas, PROVIDERS, type AiProvider } from "@/lib/ai";
import { notify } from "@/lib/prices";
import type { Item, Profile, User } from "@/lib/types";
import { AVATARS } from "@/components/Avatar";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const n = (f: FormData, k: string) => Number(f.get(k) ?? 0);
const THEMES = ["system", "light", "dark", "candy", "forest", "ocean", "arcade"];
const avatarOr = (v: string, d: string) => (AVATARS.some((a) => a.id === v) ? v : d);

async function ownList(listId: number) {
  const user = await requireUser();
  const list = getList(listId);
  if (!list || list.owner_user_id !== user.id) redirect("/?error=List+not+found");
  return { user, list };
}

async function viewList(listId: number) {
  const user = await requireUser();
  const list = getList(listId);
  if (!list || listAccess(user, list) === "none") redirect("/?error=List+not+found");
  return { user, list };
}

function inviteCode(): string {
  const words = ["GOOSE", "RACCOON", "STAR", "MAPLE", "COMET", "PICKLE", "WAFFLE", "OTTER", "SPROUT", "PEBBLE"];
  return `${words[Math.floor(Math.random() * words.length)]}-${randomToken(4).toUpperCase().replace(/[^A-Z0-9]/g, "X").slice(0, 5)}`;
}

// ---------- Lists ----------

export async function createList(form: FormData) {
  const user = await requireUser();
  const profile = get<Profile>("SELECT * FROM profiles WHERE id = ? AND user_id = ?", n(form, "profile_id"), user.id);
  if (!profile) redirect("/lists/new?error=Pick+a+profile");
  const title = s(form, "title");
  if (!title) redirect("/lists/new?error=Give+your+list+a+name");
  const vis = ["private", "family"].includes(s(form, "visibility")) ? s(form, "visibility") : "family";
  const r = run(
    "INSERT INTO lists (profile_id, title, description, emoji, occasion, event_date, visibility) VALUES (?, ?, ?, ?, ?, ?, ?)",
    profile.id, title, s(form, "description"), s(form, "emoji") || "🎁", s(form, "occasion"), s(form, "event_date") || null, vis,
  );
  redirect(`/lists/${r.lastInsertRowid}`);
}

export async function updateList(form: FormData) {
  const { user, list } = await ownList(n(form, "list_id"));
  const vis = ["private", "family", "custom"].includes(s(form, "visibility")) ? s(form, "visibility") : "family";
  const allowedFamilies = new Set(shareableFamilies(user.id).map((f) => f.id));
  const profileId = n(form, "profile_id");
  const profileOk = get("SELECT 1 FROM profiles WHERE id = ? AND user_id = ?", profileId, user.id);
  tx(() => {
    run(
      "UPDATE lists SET title = ?, description = ?, emoji = ?, occasion = ?, event_date = ?, visibility = ?, profile_id = ? WHERE id = ?",
      s(form, "title") || list.title, s(form, "description"), s(form, "emoji") || "🎁", s(form, "occasion"),
      s(form, "event_date") || null, vis, profileOk ? profileId : list.profile_id, list.id,
    );
    run("DELETE FROM list_families WHERE list_id = ?", list.id);
    for (const fid of form.getAll("families").map(Number)) {
      if (allowedFamilies.has(fid)) run("INSERT OR IGNORE INTO list_families (list_id, family_id) VALUES (?, ?)", list.id, fid);
    }
    run("DELETE FROM list_hidden_users WHERE list_id = ?", list.id);
    for (const uid of form.getAll("hidden").map(Number)) {
      if (uid && uid !== user.id) run("INSERT OR IGNORE INTO list_hidden_users (list_id, user_id) VALUES (?, ?)", list.id, uid);
    }
  });
  redirect(`/lists/${list.id}?ok=Saved`);
}

export async function deleteList(form: FormData) {
  const { list } = await ownList(n(form, "list_id"));
  run("DELETE FROM lists WHERE id = ?", list.id);
  redirect("/?ok=List+deleted");
}

// ---------- Items ----------

export async function autofill(url: string): Promise<{ ok: true; info: ProductInfo } | { ok: false; error: string }> {
  await requireUser();
  try {
    return { ok: true, info: await fetchProduct(url) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function itemFields(form: FormData) {
  const rawUrl = s(form, "url");
  const url = rawUrl ? normalizeUrl(rawUrl)?.toString() ?? "" : "";
  const store = s(form, "store") || (url ? storeFromHost(new URL(url).hostname).name : "");
  const image = s(form, "image_url");
  return {
    title: s(form, "title").slice(0, 200),
    url,
    store,
    price: parseMoney(form.get("price")),
    image_url: /^https?:\/\//.test(image) ? image : "",
    notes: s(form, "notes").slice(0, 1000),
    priority: Math.min(3, Math.max(1, n(form, "priority") || 2)),
    quantity: Math.min(99, Math.max(1, n(form, "quantity") || 1)),
  };
}

function insertItem(listId: number, f: ReturnType<typeof itemFields>, guest: string | null = null) {
  const r = run(
    "INSERT INTO items (list_id, title, url, store, price_cents, image_url, notes, priority, quantity, created_by_guest, price_checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    listId, f.title, f.url, f.store, f.price, f.image_url, f.notes, f.priority, f.quantity, guest, f.price ? Math.floor(Date.now() / 1000) : null,
  );
  if (f.price) run("INSERT INTO price_history (item_id, price_cents, store) VALUES (?, ?, ?)", Number(r.lastInsertRowid), f.price, f.store);
}

export async function addItem(form: FormData) {
  const { list } = await ownList(n(form, "list_id"));
  const f = itemFields(form);
  if (!f.title) redirect(`/lists/${list.id}?error=Every+wish+needs+a+name`);
  insertItem(list.id, f);
  redirect(`/lists/${list.id}?ok=Added`);
}

export async function updateItem(form: FormData) {
  const item = get<Item>("SELECT * FROM items WHERE id = ?", n(form, "item_id"));
  if (!item) redirect("/");
  const { list } = await ownList(item.list_id);
  const f = itemFields(form);
  run(
    "UPDATE items SET title = ?, url = ?, store = ?, price_cents = ?, image_url = ?, notes = ?, priority = ?, quantity = ? WHERE id = ?",
    f.title || item.title, f.url, f.store, f.price, f.image_url, f.notes, f.priority, f.quantity, item.id,
  );
  redirect(`/lists/${list.id}?ok=Updated#item-${item.id}`);
}

export async function deleteItem(form: FormData) {
  const item = get<Item>("SELECT * FROM items WHERE id = ?", n(form, "item_id"));
  if (!item) redirect("/");
  const { list } = await ownList(item.list_id);
  run("DELETE FROM items WHERE id = ?", item.id);
  revalidatePath(`/lists/${list.id}`);
}

export async function claimItem(form: FormData) {
  const item = get<Item>("SELECT * FROM items WHERE id = ?", n(form, "item_id"));
  if (!item) redirect("/");
  const { user, list } = await viewList(item.list_id);
  const isOwner = list.owner_user_id === user.id;
  if (isOwner && !ownerSeesClaims(list)) redirect(`/lists/${list.id}`);
  const action = s(form, "action");
  if (action === "claim" && !item.claimed_by) {
    run("UPDATE items SET claimed_by = ?, claimed_name = ? WHERE id = ?", user.id, user.name, item.id);
  } else if (action === "unclaim" && item.claimed_by === user.id) {
    run("UPDATE items SET claimed_by = NULL, claimed_name = NULL, purchased = 0 WHERE id = ?", item.id);
  } else if (action === "purchased" && item.claimed_by === user.id) {
    run("UPDATE items SET purchased = 1 - purchased WHERE id = ?", item.id);
  }
  revalidatePath(`/lists/${list.id}`);
}

export async function refreshItem(form: FormData) {
  const item = get<Item>("SELECT * FROM items WHERE id = ?", n(form, "item_id"));
  if (!item || !item.url) redirect("/");
  const { list } = await viewList(item.list_id);
  try {
    const info = await fetchProduct(item.url);
    if (info.price_cents) {
      if (item.price_cents && info.price_cents < item.price_cents) {
        notify(list.owner_user_id, "deal", `Price drop on ${item.title}`, `/lists/${list.id}#item-${item.id}`);
      }
      run("INSERT INTO price_history (item_id, price_cents, store) VALUES (?, ?, ?)", item.id, info.price_cents, info.store);
      run("UPDATE items SET price_cents = ?, price_checked_at = unixepoch(), image_url = CASE WHEN image_url = '' THEN ? ELSE image_url END WHERE id = ?", info.price_cents, info.image_url ?? "", item.id);
    } else {
      run("UPDATE items SET price_checked_at = unixepoch() WHERE id = ?", item.id);
    }
  } catch {
    redirect(`/lists/${list.id}?error=Couldn't+reach+that+store+right+now#item-${item.id}`);
  }
  redirect(`/lists/${list.id}?ok=Price+checked#item-${item.id}`);
}

// ---------- Guests (whitelisted emails editing without an account) ----------

export async function addGuest(form: FormData) {
  const { list } = await ownList(n(form, "list_id"));
  const email = s(form, "email").toLowerCase();
  if (!email.includes("@")) redirect(`/lists/${list.id}/share?error=Enter+an+email`);
  run(
    "INSERT INTO list_guests (list_id, email, token, can_edit) VALUES (?, ?, ?, ?) ON CONFLICT(list_id, email) DO UPDATE SET can_edit = excluded.can_edit",
    list.id, email, randomToken(18), form.get("can_edit") ? 1 : 0,
  );
  redirect(`/lists/${list.id}/share?ok=Guest+link+created`);
}

export async function removeGuest(form: FormData) {
  const { list } = await ownList(n(form, "list_id"));
  run("DELETE FROM list_guests WHERE id = ? AND list_id = ?", n(form, "guest_id"), list.id);
  redirect(`/lists/${list.id}/share?ok=Guest+removed`);
}

function guestByToken(token: string) {
  return get<{ id: number; list_id: number; email: string; can_edit: number }>("SELECT * FROM list_guests WHERE token = ?", token);
}

export async function guestAddItem(form: FormData) {
  const token = s(form, "token");
  const g = guestByToken(token);
  if (!g || !g.can_edit) redirect("/");
  const f = itemFields(form);
  if (f.title) insertItem(g.list_id, f, g.email);
  redirect(`/s/${token}?ok=Added`);
}

export async function guestDeleteItem(form: FormData) {
  const token = s(form, "token");
  const g = guestByToken(token);
  if (!g || !g.can_edit) redirect("/");
  run("DELETE FROM items WHERE id = ? AND list_id = ?", n(form, "item_id"), g.list_id);
  redirect(`/s/${token}`);
}

export async function guestAutofill(token: string, url: string): Promise<{ ok: true; info: ProductInfo } | { ok: false; error: string }> {
  const g = guestByToken(token);
  if (!g || !g.can_edit) return { ok: false, error: "This link no longer works." };
  try {
    return { ok: true, info: await fetchProduct(url) };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ---------- AI suggestions (review list) ----------

export async function requestSuggestions(form: FormData) {
  const { list } = await ownList(n(form, "list_id"));
  const profile = get<Profile>("SELECT * FROM profiles WHERE id = ?", list.profile_id)!;
  const existing = all<{ title: string }>("SELECT title FROM items WHERE list_id = ?", list.id).map((r) => r.title);
  try {
    const { ideas, source } = await generateIdeas({
      listTitle: list.title,
      occasion: list.occasion,
      forName: profile.name,
      age: ageFrom(profile.birthday),
      existing,
      hint: s(form, "hint"),
    });
    for (const i of ideas) {
      run(
        "INSERT INTO suggestions (list_id, title, reason, est_price_cents, source) VALUES (?, ?, ?, ?, ?)",
        list.id, i.title, i.reason, i.est_price ? Math.round(i.est_price * 100) : null, source,
      );
    }
  } catch (e) {
    redirect(`/lists/${list.id}/ideas?error=${encodeURIComponent((e as Error).message)}`);
  }
  redirect(`/lists/${list.id}/ideas`);
}

export async function reviewSuggestion(form: FormData) {
  const sug = get<{ id: number; list_id: number; title: string; reason: string; est_price_cents: number | null }>(
    "SELECT * FROM suggestions WHERE id = ? AND status = 'pending'", n(form, "suggestion_id"),
  );
  if (!sug) redirect("/");
  const { list } = await ownList(sug.list_id);
  if (s(form, "decision") === "accept") {
    run(
      "INSERT INTO items (list_id, title, notes, price_cents) VALUES (?, ?, ?, ?)",
      list.id, sug.title, sug.reason, sug.est_price_cents,
    );
    run("UPDATE suggestions SET status = 'accepted' WHERE id = ?", sug.id);
  } else {
    run("UPDATE suggestions SET status = 'rejected' WHERE id = ?", sug.id);
  }
  revalidatePath(`/lists/${list.id}/ideas`);
}

// ---------- Families ----------

export async function createFamily(form: FormData) {
  const user = await requireUser();
  const name = s(form, "name");
  if (!name) redirect("/families?error=Name+your+family");
  tx(() => {
    const r = run("INSERT INTO families (name, invite_code, created_by) VALUES (?, ?, ?)", name, inviteCode(), user.id);
    run("INSERT INTO family_members (family_id, user_id, role) VALUES (?, ?, 'admin')", Number(r.lastInsertRowid), user.id);
  });
  redirect("/families?ok=Family+created");
}

export async function joinFamily(form: FormData) {
  const user = await requireUser();
  const fam = get<{ id: number; name: string }>("SELECT id, name FROM families WHERE invite_code = ?", s(form, "code").toUpperCase());
  if (!fam) redirect("/families?error=No+family+has+that+code");
  run("INSERT OR IGNORE INTO family_members (family_id, user_id) VALUES (?, ?)", fam.id, user.id);
  for (const m of all<{ user_id: number }>("SELECT user_id FROM family_members WHERE family_id = ? AND user_id != ?", fam.id, user.id)) {
    notify(m.user_id, "family", `${user.name} joined ${fam.name}`, "/families");
  }
  redirect(`/families?ok=${encodeURIComponent(`Welcome to ${fam.name}!`)}`);
}

async function familyAdmin(familyId: number): Promise<User> {
  const user = await requireUser();
  const m = get<{ role: string }>("SELECT role FROM family_members WHERE family_id = ? AND user_id = ?", familyId, user.id);
  if (m?.role !== "admin") redirect("/families?error=Only+family+admins+can+do+that");
  return user;
}

export async function leaveFamily(form: FormData) {
  const user = await requireUser();
  const fid = n(form, "family_id");
  tx(() => {
    run("DELETE FROM family_members WHERE family_id = ? AND user_id = ?", fid, user.id);
    const left = get<{ n: number }>("SELECT COUNT(*) AS n FROM family_members WHERE family_id = ?", fid)!.n;
    if (left === 0) run("DELETE FROM families WHERE id = ?", fid);
    else if (!get("SELECT 1 FROM family_members WHERE family_id = ? AND role = 'admin'", fid)) {
      run("UPDATE family_members SET role = 'admin' WHERE rowid = (SELECT MIN(rowid) FROM family_members WHERE family_id = ?)", fid);
    }
  });
  redirect("/families?ok=You+left+the+family");
}

export async function removeMember(form: FormData) {
  const fid = n(form, "family_id");
  const admin = await familyAdmin(fid);
  const uid = n(form, "user_id");
  if (uid !== admin.id) run("DELETE FROM family_members WHERE family_id = ? AND user_id = ?", fid, uid);
  redirect("/families");
}

export async function setMemberRole(form: FormData) {
  const fid = n(form, "family_id");
  await familyAdmin(fid);
  run("UPDATE family_members SET role = ? WHERE family_id = ? AND user_id = ?", s(form, "role") === "admin" ? "admin" : "member", fid, n(form, "user_id"));
  redirect("/families");
}

export async function newInviteCode(form: FormData) {
  const fid = n(form, "family_id");
  await familyAdmin(fid);
  run("UPDATE families SET invite_code = ? WHERE id = ?", inviteCode(), fid);
  redirect("/families?ok=New+invite+code+made");
}

export async function connectFamily(form: FormData) {
  const fid = n(form, "family_id");
  await familyAdmin(fid);
  const other = get<{ id: number }>("SELECT id FROM families WHERE invite_code = ?", s(form, "code").toUpperCase());
  if (!other || other.id === fid) redirect("/families?error=No+other+family+has+that+code");
  const [a, b] = fid < other.id ? [fid, other.id] : [other.id, fid];
  run("INSERT OR IGNORE INTO family_links (family_a, family_b) VALUES (?, ?)", a, b);
  redirect("/families?ok=Families+connected");
}

export async function disconnectFamily(form: FormData) {
  const fid = n(form, "family_id");
  await familyAdmin(fid);
  const other = n(form, "other_id");
  run("DELETE FROM family_links WHERE (family_a = ? AND family_b = ?) OR (family_a = ? AND family_b = ?)", fid, other, other, fid);
  redirect("/families?ok=Disconnected");
}

// ---------- Profiles & account ----------

export async function saveAccount(form: FormData) {
  const user = await requireUser();
  const name = s(form, "name") || user.name;
  const avatar = avatarOr(s(form, "avatar"), user.avatar);
  const theme = THEMES.includes(s(form, "theme")) ? s(form, "theme") : user.theme;
  run("UPDATE users SET name = ?, avatar = ?, theme = ? WHERE id = ?", name, avatar, theme, user.id);
  run("UPDATE profiles SET name = ?, avatar = ?, birthday = ? WHERE user_id = ? AND is_primary = 1", name, avatar, s(form, "birthday") || null, user.id);
  redirect("/settings?ok=Saved");
}

export async function setTheme(form: FormData) {
  const user = await requireUser();
  const theme = s(form, "theme");
  if (THEMES.includes(theme)) run("UPDATE users SET theme = ? WHERE id = ?", theme, user.id);
  revalidatePath("/", "layout");
}

export async function saveProfile(form: FormData) {
  const user = await requireUser();
  const id = n(form, "profile_id");
  const name = s(form, "name");
  if (!name) redirect("/settings?error=Profiles+need+a+name");
  const avatar = avatarOr(s(form, "avatar"), "goose");
  if (id) {
    run("UPDATE profiles SET name = ?, avatar = ?, birthday = ? WHERE id = ? AND user_id = ? AND is_primary = 0", name, avatar, s(form, "birthday") || null, id, user.id);
  } else {
    run("INSERT INTO profiles (user_id, name, avatar, birthday) VALUES (?, ?, ?, ?)", user.id, name, avatar, s(form, "birthday") || null);
  }
  redirect("/settings?ok=Profile+saved");
}

export async function deleteProfile(form: FormData) {
  const user = await requireUser();
  run("DELETE FROM profiles WHERE id = ? AND user_id = ? AND is_primary = 0", n(form, "profile_id"), user.id);
  redirect("/settings?ok=Profile+removed");
}

export async function markAllRead() {
  const user = await requireUser();
  run("UPDATE notifications SET read = 1 WHERE user_id = ?", user.id);
  revalidatePath("/", "layout");
}

// ---------- Admin ----------

export async function saveAiSettings(form: FormData) {
  await requireAdmin();
  const provider = s(form, "provider") as AiProvider;
  if (!PROVIDERS.some((p) => p.id === provider)) redirect("/admin?error=Unknown+provider");
  setSetting("ai_provider", provider);
  setSetting("ai_model", s(form, "model"));
  setSetting("ai_base_url", s(form, "base_url"));
  if (s(form, "api_key")) setSetting("ai_api_key", s(form, "api_key"));
  if (form.get("clear_key")) setSetting("ai_api_key", "");
  redirect("/admin?ok=AI+settings+saved");
}

export async function adminUser(form: FormData) {
  const admin = await requireAdmin();
  const uid = n(form, "user_id");
  if (uid === admin.id) redirect("/admin?error=You+can't+change+your+own+admin+account+here");
  const action = s(form, "action");
  if (action === "delete") run("DELETE FROM users WHERE id = ?", uid);
  if (action === "toggle-admin") run("UPDATE users SET is_admin = 1 - is_admin WHERE id = ?", uid);
  if (action === "reset-2fa") run("UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?", uid);
  redirect("/admin?ok=Done");
}
