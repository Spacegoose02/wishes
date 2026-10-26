"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { all, get, run, setSetting, tx } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/auth";
import { canEditProfile, getList, isManager, isRecipient, listAccess, listManagers, shareableFamilies, familyPeople } from "@/lib/access";
import { randomToken } from "@/lib/crypto";
import { fetchProduct, normalizeUrl, type ProductInfo } from "@/lib/scrape";
import { storeFromHost, storeSearch } from "@/lib/scrape/stores";
import { bestMatches, searchStores } from "@/lib/scrape/search";
import { compareItem } from "@/lib/compare";
import { formatMoney, parseMoney, ageFrom } from "@/lib/format";
import { guessCategory, validCategory } from "@/lib/categories";
import { generateIdeas, PROVIDERS, type AiProvider } from "@/lib/ai";
import { notify } from "@/lib/prices";
import type { Item, Profile, User } from "@/lib/types";
import { isValidAvatar, rollAvatar as roll, AVATARS } from "@/components/Avatar";
import { parseCollection } from "@/components/AvatarPicker";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const n = (f: FormData, k: string) => Number(f.get(k) ?? 0);
const THEMES = ["system", "light", "dark", "candy", "forest", "ocean", "arcade"];

function avatarFor(user: User, v: string, fallback: string): string {
  if (!isValidAvatar(v)) return fallback;
  const isStatic = AVATARS.some((a) => a.id === v);
  return isStatic || parseCollection(user.unlocked_avatars).includes(v) || v === user.avatar ? v : fallback;
}

async function ownList(listId: number) {
  const user = await requireUser();
  const list = getList(listId);
  if (!list || !isManager(user.id, list)) redirect("/?error=List+not+found");
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

function setHiddenUsers(listId: number, ownerId: number, ids: number[]) {
  run("DELETE FROM list_hidden_users WHERE list_id = ?", listId);
  const allowed = new Set(familyPeople(ownerId).map((p) => p.id));
  for (const uid of ids) {
    if (allowed.has(uid)) run("INSERT OR IGNORE INTO list_hidden_users (list_id, user_id) VALUES (?, ?)", listId, uid);
  }
}

// ---------- Lists ----------

// "Who is it for?" can be: one of my profiles (p:ID), any profile in my families (p:ID),
// a family member (u:ID, optionally kept secret from them), or a brand-new name.
export async function createList(form: FormData) {
  const user = await requireUser();
  const title = s(form, "title");
  if (!title) redirect("/lists/new?error=Give+your+list+a+name");
  const target = s(form, "for");
  const newName = s(form, "new_name").slice(0, 60);
  const secret = !!form.get("secret");
  const people = familyPeople(user.id);
  const vis = ["private", "family"].includes(s(form, "visibility")) ? s(form, "visibility") : "family";

  const id = tx(() => {
    let profile: Profile | undefined;
    let hideFrom: number[] = form.getAll("hidden").map(Number);
    if (newName || target === "new") {
      if (!newName) return 0;
      const r = run("INSERT INTO profiles (user_id, name, avatar) VALUES (?, ?, ?)", user.id, newName, roll());
      profile = get<Profile>("SELECT * FROM profiles WHERE id = ?", Number(r.lastInsertRowid));
    } else if (target.startsWith("u:")) {
      const other = people.find((p) => p.id === Number(target.slice(2)));
      if (!other) return 0;
      if (secret) {
        // A profile I manage that stands for them, so the list stays out of their view.
        profile = get<Profile>("SELECT * FROM profiles WHERE user_id = ? AND linked_user_id = ?", user.id, other.id);
        if (!profile) {
          const r = run("INSERT INTO profiles (user_id, name, avatar, linked_user_id) VALUES (?, ?, ?, ?)", user.id, other.name, other.avatar, other.id);
          profile = get<Profile>("SELECT * FROM profiles WHERE id = ?", Number(r.lastInsertRowid));
        }
        hideFrom = [...hideFrom, other.id];
      } else {
        profile = get<Profile>("SELECT * FROM profiles WHERE user_id = ? AND is_primary = 1", other.id);
      }
    } else if (target.startsWith("p:")) {
      const p = get<Profile>("SELECT * FROM profiles WHERE id = ?", Number(target.slice(2)));
      if (p && (p.user_id === user.id || people.some((x) => x.id === p.user_id))) profile = p;
    }
    if (!profile) return 0;
    const r = run(
      "INSERT INTO lists (profile_id, title, description, emoji, occasion, event_date, visibility) VALUES (?, ?, ?, ?, ?, ?, ?)",
      profile.id, title, s(form, "description"), s(form, "emoji") || "🎁", s(form, "occasion"), s(form, "event_date") || null, vis,
    );
    const listId = Number(r.lastInsertRowid);
    // Making a list for someone else's profile makes you a co-owner of it.
    if (profile.user_id !== user.id) run("INSERT OR IGNORE INTO list_owners (list_id, user_id) VALUES (?, ?)", listId, user.id);
    setHiddenUsers(listId, user.id, hideFrom);
    return listId;
  });
  if (!id) redirect("/lists/new?error=" + encodeURIComponent("Pick who the list is for, or type a name"));
  redirect(`/lists/${id}`);
}

export async function updateList(form: FormData) {
  const { user, list } = await ownList(n(form, "list_id"));
  const vis = ["private", "family", "custom"].includes(s(form, "visibility")) ? s(form, "visibility") : "family";
  const allowedFamilies = new Set(shareableFamilies(list.owner_user_id).map((f) => f.id));
  const profileId = n(form, "profile_id");
  const profileOk = get("SELECT 1 FROM profiles WHERE id = ? AND user_id = ?", profileId, list.owner_user_id);
  const people = new Set(familyPeople(list.owner_user_id).map((p) => p.id));
  tx(() => {
    run(
      "UPDATE lists SET title = ?, description = ?, emoji = ?, occasion = ?, event_date = ?, visibility = ?, profile_id = ?, review_purchases = ? WHERE id = ?",
      s(form, "title") || list.title, s(form, "description"), s(form, "emoji") || "🎁", s(form, "occasion"),
      s(form, "event_date") || null, vis, profileOk ? profileId : list.profile_id, form.get("review_purchases") ? 1 : 0, list.id,
    );
    run("DELETE FROM list_families WHERE list_id = ?", list.id);
    for (const fid of form.getAll("families").map(Number)) {
      if (allowedFamilies.has(fid)) run("INSERT OR IGNORE INTO list_families (list_id, family_id) VALUES (?, ?)", list.id, fid);
    }
    setHiddenUsers(list.id, list.owner_user_id, form.getAll("hidden").map(Number).filter((id) => id !== user.id));
    // Only the profile's owner decides who else co-owns the list.
    if (list.owner_user_id === user.id) {
      run("DELETE FROM list_owners WHERE list_id = ?", list.id);
      for (const uid of form.getAll("owners").map(Number)) {
        if (people.has(uid)) run("INSERT OR IGNORE INTO list_owners (list_id, user_id) VALUES (?, ?)", list.id, uid);
      }
    }
  });
  redirect(`/lists/${list.id}?ok=Saved`);
}

export async function quickHide(form: FormData) {
  const { list } = await ownList(n(form, "list_id"));
  const uid = n(form, "user_id");
  if (s(form, "action") === "unhide") run("DELETE FROM list_hidden_users WHERE list_id = ? AND user_id = ?", list.id, uid);
  else if (familyPeople(list.owner_user_id).some((p) => p.id === uid)) run("INSERT OR IGNORE INTO list_hidden_users (list_id, user_id) VALUES (?, ?)", list.id, uid);
  revalidatePath(`/lists/${list.id}/share`);
}

export async function deleteList(form: FormData) {
  const { user, list } = await ownList(n(form, "list_id"));
  if (list.owner_user_id !== user.id) redirect(`/lists/${list.id}?error=Only+the+main+owner+can+delete+this+list`);
  run("DELETE FROM lists WHERE id = ?", list.id);
  redirect("/?ok=List+deleted");
}

// ---------- Items ----------

export async function autofill(url: string): Promise<{ ok: true; info: ProductInfo & { category: string } } | { ok: false; error: string }> {
  await requireUser();
  return doAutofill(url);
}

async function doAutofill(url: string): Promise<{ ok: true; info: ProductInfo & { category: string } } | { ok: false; error: string }> {
  try {
    const info = await fetchProduct(url);
    return { ok: true, info: { ...info, category: guessCategory(info.title ?? "", info.store) } };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function itemFields(form: FormData) {
  const rawUrl = s(form, "url");
  const url = rawUrl ? normalizeUrl(rawUrl)?.toString() ?? "" : "";
  const store = s(form, "store") || (url ? storeFromHost(new URL(url).hostname).name : "");
  const image = s(form, "image_url");
  const title = s(form, "title").slice(0, 200);
  return {
    title,
    url,
    store,
    price: parseMoney(form.get("price")),
    image_url: /^https?:\/\//.test(image) ? image : "",
    notes: s(form, "notes").slice(0, 1000),
    priority: Math.min(3, Math.max(1, n(form, "priority") || 2)),
    quantity: Math.min(99, Math.max(1, n(form, "quantity") || 1)),
    category: validCategory(s(form, "category")) || guessCategory(title, store),
    variant: s(form, "variant").slice(0, 100),
    color: s(form, "color").slice(0, 60),
    size: s(form, "size").slice(0, 60),
  };
}

function insertItem(listId: number, f: ReturnType<typeof itemFields>, guest: string | null = null) {
  const r = run(
    `INSERT INTO items (list_id, title, url, store, price_cents, image_url, notes, priority, quantity, created_by_guest, price_checked_at, category, variant, color, size)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    listId, f.title, f.url, f.store, f.price, f.image_url, f.notes, f.priority, f.quantity, guest,
    null, f.category, f.variant, f.color, f.size,
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
  if (f.price && f.price !== item.price_cents) {
    run("INSERT INTO price_history (item_id, price_cents, store) VALUES (?, ?, ?)", item.id, f.price, `${f.store} (edited)`);
  }
  run(
    "UPDATE items SET title = ?, url = ?, store = ?, price_cents = ?, image_url = ?, notes = ?, priority = ?, quantity = ?, category = ?, variant = ?, color = ?, size = ? WHERE id = ?",
    f.title || item.title, f.url, f.store, f.price, f.image_url, f.notes, f.priority, f.quantity, f.category, f.variant, f.color, f.size, item.id,
  );
  recomputePurchased(item.id);
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
  if (isRecipient(user.id, list)) redirect(`/lists/${list.id}`);
  const action = s(form, "action");
  if (action === "claim" && !item.claimed_by) {
    run("UPDATE items SET claimed_by = ?, claimed_name = ? WHERE id = ?", user.id, user.name, item.id);
  } else if (action === "unclaim" && item.claimed_by === user.id) {
    run("UPDATE items SET claimed_by = NULL, claimed_name = NULL WHERE id = ?", item.id);
  }
  revalidatePath(`/lists/${list.id}`);
}

export async function refreshItem(form: FormData) {
  const item = get<Item>("SELECT * FROM items WHERE id = ?", n(form, "item_id"));
  if (!item || !item.url) redirect("/");
  const { list } = await viewList(item.list_id);
  const back = (key: "ok" | "error", msg: string) => redirect(`/lists/${list.id}?${key}=${encodeURIComponent(msg)}#item-${item.id}`);
  let info: ProductInfo;
  try {
    info = await fetchProduct(item.url);
  } catch {
    return back("error", "Couldn't reach that store right now. Try again in a bit.");
  }
  run("UPDATE items SET price_checked_at = unixepoch() WHERE id = ?", item.id);
  const kept = item.price_cents ? ` Kept ${formatMoney(item.price_cents)}.` : "";
  if (info.problem === "blocked") return back("error", `${info.store} blocked the price check.${kept} You can update the price by editing the wish, or try Compare stores.`);
  if (info.problem === "missing") return back("error", `That ${info.store} page doesn't exist anymore.${kept} Try Compare stores to find it somewhere else.`);
  if (info.problem === "unavailable") return back("error", `${info.store} lists it as currently unavailable, so there's no price to read.${kept}`);
  if (!info.price_cents) return back("error", `Couldn't find a price on that ${info.store} page.${kept}`);
  run("INSERT INTO price_history (item_id, price_cents, store) VALUES (?, ?, ?)", item.id, info.price_cents, info.store);
  run(
    "UPDATE items SET price_cents = ?, image_url = CASE WHEN image_url = '' THEN ? ELSE image_url END WHERE id = ?",
    info.price_cents, info.image_url ?? "", item.id,
  );
  if (item.price_cents === info.price_cents) return back("ok", `${info.store} still has it for ${formatMoney(info.price_cents)}.`);
  if (item.price_cents && info.price_cents < item.price_cents) {
    for (const uid of listManagers(list)) if (!isRecipient(uid, list)) notify(uid, "deal", `Price drop on ${item.title}: ${formatMoney(info.price_cents)}`, `/lists/${list.id}#item-${item.id}`);
  }
  back("ok", item.price_cents
    ? `Updated from ${formatMoney(item.price_cents)} to ${formatMoney(info.price_cents)} (${info.store}).`
    : `${info.store} price: ${formatMoney(info.price_cents)}.`);
}

export async function compareStores(form: FormData) {
  const item = get<Item>("SELECT * FROM items WHERE id = ?", n(form, "item_id"));
  if (!item) redirect("/");
  const { list } = await viewList(item.list_id);
  let count = 0;
  try {
    count = (await compareItem(item)).length;
  } catch {
    redirect(`/lists/${list.id}?error=${encodeURIComponent("Couldn't search the stores right now.")}#item-${item.id}`);
  }
  const msg = count ? `Found it at ${count} other store${count === 1 ? "" : "s"}.` : "No close matches at Walmart or Amazon.";
  redirect(`/lists/${list.id}?ok=${encodeURIComponent(msg)}#item-${item.id}`);
}

function isSearchLink(url: string): boolean {
  return /\/s\?k=|\/search|searchTerm=|searchpage/.test(url);
}

// ---------- Purchases ----------

function recomputePurchased(itemId: number) {
  const item = get<Item>("SELECT * FROM items WHERE id = ?", itemId);
  if (!item) return;
  const bought = get<{ q: number }>("SELECT COALESCE(SUM(quantity), 0) AS q FROM purchases WHERE item_id = ? AND status != 'rejected'", itemId)!.q;
  run("UPDATE items SET purchased = ? WHERE id = ?", bought >= item.quantity ? 1 : 0, itemId);
}

export async function recordPurchase(form: FormData) {
  const item = get<Item>("SELECT * FROM items WHERE id = ?", n(form, "item_id"));
  if (!item) redirect("/");
  const { user, list } = await viewList(item.list_id);
  const self = isRecipient(user.id, list); // the list's own person marking "I got it myself"
  const manager = isManager(user.id, list);
  const pending = !!list.review_purchases && !manager && !self;
  const qty = Math.min(99, Math.max(1, n(form, "quantity") || 1));
  run(
    "INSERT INTO purchases (item_id, list_id, item_title, buyer_user_id, buyer_name, quantity, price_cents, store, note, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    item.id, list.id, item.title, user.id, user.name, qty, parseMoney(form.get("price")) ?? item.price_cents, s(form, "store") || item.store,
    s(form, "note").slice(0, 300), pending ? "pending" : "confirmed",
  );
  if (!item.claimed_by && !self) run("UPDATE items SET claimed_by = ?, claimed_name = ? WHERE id = ?", user.id, user.name, item.id);
  recomputePurchased(item.id);
  if (pending) {
    for (const uid of listManagers(list)) {
      if (!isRecipient(uid, list)) notify(uid, "purchase", `${user.name} bought ${item.title}. Please review it.`, `/lists/${list.id}/purchases`);
    }
  }
  redirect(`/lists/${list.id}?ok=${encodeURIComponent(pending ? "Marked bought. A list manager will review it." : self ? "Marked as got it" : "Marked bought")}#item-${item.id}`);
}

export async function reviewPurchase(form: FormData) {
  const p = get<{ id: number; list_id: number; item_id: number | null; buyer_user_id: number | null; item_title: string }>(
    "SELECT * FROM purchases WHERE id = ?", n(form, "purchase_id"),
  );
  if (!p) redirect("/");
  const { user, list } = await ownList(p.list_id);
  if (isRecipient(user.id, list)) redirect(`/lists/${list.id}`);
  const approve = s(form, "decision") === "approve";
  run("UPDATE purchases SET status = ?, reviewed_by = ? WHERE id = ?", approve ? "confirmed" : "rejected", user.id, p.id);
  if (p.item_id) recomputePurchased(p.item_id);
  if (!approve && p.buyer_user_id) notify(p.buyer_user_id, "purchase", `${user.name} didn't confirm your purchase of ${p.item_title}.`, `/lists/${list.id}`);
  revalidatePath(`/lists/${list.id}/purchases`);
}

export async function undoPurchase(form: FormData) {
  const p = get<{ id: number; list_id: number; item_id: number | null; buyer_user_id: number | null }>("SELECT * FROM purchases WHERE id = ?", n(form, "purchase_id"));
  if (!p) redirect("/");
  const { user, list } = await viewList(p.list_id);
  if (p.buyer_user_id !== user.id && !(isManager(user.id, list) && !isRecipient(user.id, list))) redirect(`/lists/${list.id}`);
  run("DELETE FROM purchases WHERE id = ?", p.id);
  if (p.item_id) recomputePurchased(p.item_id);
  revalidatePath(`/lists/${list.id}`);
  revalidatePath(`/lists/${list.id}/purchases`);
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

// Guests mark purchases under their email; review applies just like for members.
export async function guestRecordPurchase(form: FormData) {
  const token = s(form, "token");
  const g = guestByToken(token);
  if (!g) redirect("/");
  const item = get<Item>("SELECT * FROM items WHERE id = ? AND list_id = ?", n(form, "item_id"), g.list_id);
  const list = getList(g.list_id);
  if (!item || !list) redirect(`/s/${token}`);
  const pending = !!list.review_purchases;
  run(
    "INSERT INTO purchases (item_id, list_id, item_title, buyer_user_id, buyer_name, quantity, price_cents, store, note, status) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?)",
    item.id, list.id, item.title, g.email, Math.min(99, Math.max(1, n(form, "quantity") || 1)),
    parseMoney(form.get("price")) ?? item.price_cents, s(form, "store") || item.store, s(form, "note").slice(0, 300), pending ? "pending" : "confirmed",
  );
  recomputePurchased(item.id);
  for (const uid of listManagers(list)) {
    if (!isRecipient(uid, list)) {
      notify(uid, "purchase", `${g.email} bought ${item.title}${pending ? ". Please review it." : "."}`, `/lists/${list.id}/purchases`);
    }
  }
  redirect(`/s/${token}?ok=${encodeURIComponent(pending ? "Marked bought. A list manager will review it." : "Marked bought. Thank you!")}#item-${item.id}`);
}

export async function guestUndoPurchase(form: FormData) {
  const token = s(form, "token");
  const g = guestByToken(token);
  if (!g) redirect("/");
  const p = get<{ id: number; item_id: number | null }>(
    "SELECT id, item_id FROM purchases WHERE id = ? AND list_id = ? AND buyer_user_id IS NULL AND buyer_name = ? COLLATE NOCASE",
    n(form, "purchase_id"), g.list_id, g.email,
  );
  if (p) {
    run("DELETE FROM purchases WHERE id = ?", p.id);
    if (p.item_id) recomputePurchased(p.item_id);
  }
  redirect(`/s/${token}`);
}

export async function guestAutofill(token: string, url: string) {
  const g = guestByToken(token);
  if (!g || !g.can_edit) return { ok: false as const, error: "This link no longer works." };
  return doAutofill(url);
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
    // Turn each idea into a real listing when a store search finds it; otherwise keep a search link.
    const resolved = await Promise.all(ideas.map(async (i) => {
      const query = i.search || i.title;
      const prefer = /walmart/i.test(i.store ?? "") ? ["Walmart", "Amazon"] as const : ["Amazon", "Walmart"] as const;
      const found = await searchStores(query, [...prefer]).catch(() => []);
      const hit = bestMatches(i.title, found, 0.5)[0] ?? bestMatches(query, found, 0.6)[0];
      return { i, hit };
    }));
    for (const { i, hit } of resolved) {
      const fallback = storeSearch(i.store, i.search || i.title);
      run(
        "INSERT INTO suggestions (list_id, title, reason, est_price_cents, source, store, category, url, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        list.id, hit?.title.slice(0, 200) ?? i.title, i.reason,
        hit?.price_cents ?? (i.est_price ? Math.round(i.est_price * 100) : null), source,
        hit?.store ?? fallback.store, validCategory(i.category ?? "") || guessCategory(i.title), hit?.url ?? fallback.url, hit?.image_url ?? "",
      );
    }
  } catch (e) {
    redirect(`/lists/${list.id}/ideas?error=${encodeURIComponent((e as Error).message)}`);
  }
  redirect(`/lists/${list.id}/ideas`);
}

export async function reviewSuggestion(form: FormData) {
  const sug = get<{ id: number; list_id: number; title: string; reason: string; est_price_cents: number | null; url: string; store: string; category: string; image_url: string }>(
    "SELECT * FROM suggestions WHERE id = ? AND status = 'pending'", n(form, "suggestion_id"),
  );
  if (!sug) redirect("/");
  const { list } = await ownList(sug.list_id);
  if (s(form, "decision") === "accept") {
    run(
      "INSERT INTO items (list_id, title, notes, price_cents, url, store, category, image_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      list.id, sug.title, sug.reason, sug.est_price_cents, isSearchLink(sug.url) ? "" : sug.url, sug.store, sug.category, sug.image_url,
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
  const avatar = avatarFor(user, s(form, "avatar"), user.avatar);
  const theme = THEMES.includes(s(form, "theme")) ? s(form, "theme") : user.theme;
  run("UPDATE users SET name = ?, avatar = ?, theme = ? WHERE id = ?", name, avatar, theme, user.id);
  run("UPDATE profiles SET name = ?, avatar = ?, birthday = ? WHERE user_id = ? AND is_primary = 1", name, avatar, s(form, "birthday") || null, user.id);
  redirect("/settings?ok=Saved");
}

// Roll a random critter into the user's collection (and wear it). Space Goose is the 2% legendary.
export async function rollAvatar(form: FormData) {
  const user = await requireUser();
  const got = roll();
  const collection = [got, ...parseCollection(user.unlocked_avatars).filter((a) => a !== got)].slice(0, 24);
  run("UPDATE users SET unlocked_avatars = ? WHERE id = ?", collection.join(","), user.id);
  const profileId = n(form, "profile_id");
  if (profileId) run("UPDATE profiles SET avatar = ? WHERE id = ? AND user_id = ?", got, profileId, user.id);
  else {
    run("UPDATE users SET avatar = ? WHERE id = ?", got, user.id);
    run("UPDATE profiles SET avatar = ? WHERE user_id = ? AND is_primary = 1", got, user.id);
  }
  redirect(`/settings?tab=${profileId ? "profiles" : "me"}&rolled=${encodeURIComponent(got)}`);
}

export async function saveProfile(form: FormData) {
  const user = await requireUser();
  const id = n(form, "profile_id");
  const name = s(form, "name").slice(0, 60);
  const back = s(form, "back").startsWith("/") ? s(form, "back") : "/settings?tab=profiles";
  const join = back.includes("?") ? "&" : "?";
  if (!name) redirect(back + join + "error=Profiles+need+a+name");
  const avatar = avatarFor(user, s(form, "avatar"), "goose");
  if (id) {
    const profile = get<Profile>("SELECT * FROM profiles WHERE id = ?", id);
    if (!profile || !canEditProfile(user.id, profile)) redirect(back + join + "error=You+can't+edit+that+profile");
    if (profile.is_primary) redirect(back + join + "error=Change+your+own+name+on+the+Me+tab");
    run("UPDATE profiles SET name = ?, avatar = ?, birthday = ? WHERE id = ?", name, avatar, s(form, "birthday") || null, profile.id);
  } else {
    run("INSERT INTO profiles (user_id, name, avatar, birthday) VALUES (?, ?, ?, ?)", user.id, name, avatar, s(form, "birthday") || null);
  }
  redirect(back + join + "ok=Profile+saved");
}

export async function deleteProfile(form: FormData) {
  const user = await requireUser();
  run("DELETE FROM profiles WHERE id = ? AND user_id = ? AND is_primary = 0", n(form, "profile_id"), user.id);
  redirect("/settings?tab=profiles&ok=Profile+removed");
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
  if (!PROVIDERS.some((p) => p.id === provider)) redirect("/settings?tab=admin&error=Unknown+provider");
  setSetting("ai_provider", provider);
  setSetting("ai_model", s(form, "model"));
  setSetting("ai_base_url", s(form, "base_url"));
  if (s(form, "api_key")) setSetting("ai_api_key", s(form, "api_key"));
  if (form.get("clear_key")) setSetting("ai_api_key", "");
  redirect("/settings?tab=admin&ok=AI+settings+saved");
}

export async function adminUser(form: FormData) {
  const admin = await requireAdmin();
  const uid = n(form, "user_id");
  if (uid === admin.id) redirect("/settings?tab=admin&error=You+can't+change+your+own+admin+account+here");
  const action = s(form, "action");
  if (action === "delete") run("DELETE FROM users WHERE id = ?", uid);
  if (action === "toggle-admin") run("UPDATE users SET is_admin = 1 - is_admin WHERE id = ?", uid);
  if (action === "reset-2fa") run("UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?", uid);
  redirect("/settings?tab=admin&ok=Done");
}

