import "server-only";
import { redirect } from "next/navigation";
import { get, run } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getList, isManager, listAccess, familyPeople } from "@/lib/access";
import { randomToken } from "@/lib/crypto";
import { fetchProduct, normalizeUrl, type ProductInfo } from "@/lib/scrape";
import { storeFromHost } from "@/lib/scrape/stores";
import { parseMoney } from "@/lib/format";
import { guessCategory, validCategory } from "@/lib/categories";
import { sizesFromForm } from "@/lib/profile";
import { imageFromForm, isUploadUrl } from "@/lib/uploads";
import type { Item, User } from "@/lib/types";
import { isValidAvatar, AVATARS } from "@/components/Avatar";
import { parseCollection } from "@/components/AvatarPicker";

// Helpers shared by the server actions in this folder.

export const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export const n = (f: FormData, k: string) => Number(f.get(k) ?? 0);
export const THEMES = ["system", "light", "dark", "candy", "forest", "ocean", "arcade"];

export function avatarFor(user: User, v: string, fallback: string): string {
  if (!isValidAvatar(v)) return fallback;
  const isStatic = AVATARS.some((a) => a.id === v);
  return isStatic || parseCollection(user.unlocked_avatars).includes(v) || v === user.avatar ? v : fallback;
}

export async function ownList(listId: number) {
  const user = await requireUser();
  const list = getList(listId);
  if (!list || !isManager(user.id, list)) redirect("/?error=List+not+found");
  return { user, list };
}

export async function viewList(listId: number) {
  const user = await requireUser();
  const list = getList(listId);
  if (!list || listAccess(user, list) === "none") redirect("/?error=List+not+found");
  return { user, list };
}

export function inviteCode(): string {
  const words = ["GOOSE", "RACCOON", "STAR", "MAPLE", "COMET", "PICKLE", "WAFFLE", "OTTER", "SPROUT", "PEBBLE"];
  return `${words[Math.floor(Math.random() * words.length)]}-${randomToken(4).toUpperCase().replace(/[^A-Z0-9]/g, "X").slice(0, 5)}`;
}

export function setHiddenUsers(listId: number, ownerId: number, ids: number[]) {
  run("DELETE FROM list_hidden_users WHERE list_id = ?", listId);
  const allowed = new Set(familyPeople(ownerId).map((p) => p.id));
  for (const uid of ids) {
    if (allowed.has(uid)) run("INSERT OR IGNORE INTO list_hidden_users (list_id, user_id) VALUES (?, ?)", listId, uid);
  }
}

export async function doAutofill(url: string): Promise<{ ok: true; info: ProductInfo & { category: string } } | { ok: false; error: string }> {
  try {
    const info = await fetchProduct(url);
    return { ok: true, info: { ...info, category: guessCategory(info.title ?? "", info.store) } };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export function itemFields(form: FormData) {
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
    image_url: /^https?:\/\//.test(image) || isUploadUrl(image) ? image : "",
    notes: s(form, "notes").slice(0, 1000),
    priority: Math.min(3, Math.max(1, n(form, "priority") || 2)),
    quantity: Math.min(99, Math.max(1, n(form, "quantity") || 1)),
    category: validCategory(s(form, "category")) || guessCategory(title, store),
    variant: s(form, "variant").slice(0, 100),
    color: s(form, "color").slice(0, 60),
    size: s(form, "size").slice(0, 60),
  };
}

// Swap in an uploaded photo or drawing when the form has one; bounce back on a bad file.
export async function withPicture<F extends { image_url: string }>(form: FormData, f: F, back: string): Promise<F> {
  const pic = await imageFromForm(form);
  if (pic && !pic.ok) redirect(`${back}${back.includes("?") ? "&" : "?"}error=${encodeURIComponent(pic.error)}`);
  return pic ? { ...f, image_url: pic.url } : f;
}

export function insertItem(listId: number, f: ReturnType<typeof itemFields>, guest: string | null = null, needsApproval = false): number {
  const r = run(
    `INSERT INTO items (list_id, title, url, store, price_cents, image_url, notes, priority, quantity, created_by_guest, price_checked_at, category, variant, color, size, needs_approval)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    listId, f.title, f.url, f.store, f.price, f.image_url, f.notes, f.priority, f.quantity, guest,
    null, f.category, f.variant, f.color, f.size, needsApproval ? 1 : 0,
  );
  const id = Number(r.lastInsertRowid);
  if (f.price) run("INSERT INTO price_history (item_id, price_cents, store) VALUES (?, ?, ?)", id, f.price, f.store);
  return id;
}

export function isSearchLink(url: string): boolean {
  return /\/s\?k=|\/search|searchTerm=|searchpage/.test(url);
}

export function recomputePurchased(itemId: number) {
  const item = get<Item>("SELECT * FROM items WHERE id = ?", itemId);
  if (!item) return;
  const bought = get<{ q: number }>("SELECT COALESCE(SUM(quantity), 0) AS q FROM purchases WHERE item_id = ? AND status != 'rejected'", itemId)!.q;
  run("UPDATE items SET purchased = ? WHERE id = ?", bought >= item.quantity ? 1 : 0, itemId);
}

export function guestByToken(token: string) {
  return get<{ id: number; list_id: number; email: string; can_edit: number }>("SELECT * FROM list_guests WHERE token = ?", token);
}

export async function familyAdmin(familyId: number): Promise<User> {
  const user = await requireUser();
  const m = get<{ role: string }>("SELECT role FROM family_members WHERE family_id = ? AND user_id = ?", familyId, user.id);
  if (m?.role !== "admin") redirect("/families?error=Only+family+admins+can+do+that");
  return user;
}

// Age, likes, dislikes, sizes and notes from ProfileDetailsFields.
export function details(form: FormData): [number | null, string, string, string, string] {
  const age = Number(s(form, "age"));
  return [
    s(form, "age") && Number.isFinite(age) && age >= 0 && age <= 120 ? Math.round(age) : null,
    s(form, "likes").slice(0, 600),
    s(form, "dislikes").slice(0, 600),
    sizesFromForm(form),
    s(form, "gift_notes").slice(0, 600),
  ];
}
