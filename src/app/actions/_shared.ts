import "server-only";
import { redirect } from "next/navigation";
import { get, run } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { getList, isManager, isRecipient, listAccess, familyPeople, type ListWithOwner } from "@/lib/access";
import { randomToken } from "@/lib/crypto";
import { fetchProduct, normalizeUrl, type ProductInfo } from "@/lib/scrape";
import { storeFromHost } from "@/lib/scrape/stores";
import { parseMoney } from "@/lib/format";
import { guessCategory, validCategory } from "@/lib/categories";
import { sizesFromForm } from "@/lib/profile";
import { imageFromForm, isUploadUrl, sniffImage } from "@/lib/uploads";
import { aiEnabled, describeImage, friendlyError } from "@/lib/ai";
import { parseScreenshotReply, SCREENSHOT_PROMPT, SCREENSHOT_SCHEMA, type ScreenshotInfo } from "@/lib/screenshot";
import { validKind } from "@/lib/kinds";
import type { Item, User } from "@/lib/types";
import { isSharedInto, setShares, sharedWithUser } from "@/lib/sharedwishes";
export { insertItem } from "@/lib/wishes";
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

// A surprise gift doesn't exist as far as the person it's for can tell, even if they guess its id.
export function noSpoil(item: Pick<Item, "surprise">, user: User, list: ListWithOwner) {
  if (item.surprise && isRecipient(user.id, list)) redirect(`/lists/${list.id}`);
}

// A shared wish shows on more than one list; send people back to the one they were looking at.
export function pageFor(form: FormData, item: Pick<Item, "id">, list: Pick<ListWithOwner, "id">): string {
  const from = n(form, "from");
  return from && from !== list.id && isSharedInto(item.id, from) ? `/lists/${from}` : `/lists/${list.id}`;
}

// The person a wish is for (on its own list, or a sibling's list it's shared into) never
// sees who's getting it, and can't claim it for themselves.
export function isForThem(userId: number, item: Pick<Item, "id">, list: ListWithOwner): boolean {
  return isRecipient(userId, list) || sharedWithUser(item.id, userId);
}

// The add and edit forms carry "Shared with" checkboxes only when there's a sibling to pick.
export function saveShares(form: FormData, item: Pick<Item, "id" | "list_id" | "surprise">, userId: number) {
  if (!form.get("share_form")) return;
  setShares(item, form.getAll("share_list_id").map(Number).filter((x) => Number.isInteger(x) && x > 0), userId);
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

const SCREENSHOT_MAX_BYTES = 5_000_000;
const SCREENSHOT_LIMIT = 30; // per person per hour, so a stuck button can't run up the AI bill
const screenshotUses = new Map<string, number[]>();
const MIME = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif" } as const;

// Reads a screenshot of a product with the AI and returns wish details to fill in the form.
// `who` keys the hourly limit (a user id or a guest link).
export async function doReadScreenshot(form: FormData, who: string): Promise<{ ok: true; info: ScreenshotInfo } | { ok: false; error: string }> {
  if (!aiEnabled()) return { ok: false, error: "Reading screenshots needs AI turned on. An admin can do that in Settings → Server." };
  const file = form.get("screenshot");
  if (!(file instanceof Blob) || !file.size) return { ok: false, error: "Pick a screenshot first." };
  if (file.size > SCREENSHOT_MAX_BYTES) return { ok: false, error: "That picture is too big. Try a smaller screenshot." };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = sniffImage(bytes);
  if (!ext) return { ok: false, error: "That file isn't a picture we can read. Try a PNG or JPEG screenshot." };
  const now = Date.now();
  const recent = (screenshotUses.get(who) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= SCREENSHOT_LIMIT) return { ok: false, error: "That's a lot of screenshots! Take a little break and try again later." };
  screenshotUses.set(who, [...recent, now]);
  try {
    const reply = await describeImage(SCREENSHOT_PROMPT, { mime: MIME[ext], base64: Buffer.from(bytes).toString("base64") }, SCREENSHOT_SCHEMA, AbortSignal.timeout(60_000));
    const info = parseScreenshotReply(reply);
    if (!info.found) return { ok: false, error: "Hmm, we couldn't spot a wish in that picture. Try a screenshot that shows the product's name." };
    return { ok: true, info };
  } catch (e) {
    return { ok: false, error: friendlyError(e) };
  }
}

export function itemFields(form: FormData) {
  const rawUrl = s(form, "url");
  const url = rawUrl ? normalizeUrl(rawUrl)?.toString() ?? "" : "";
  const store = s(form, "store") || (url ? storeFromHost(new URL(url).hostname).name : "");
  const image = s(form, "image_url");
  const title = s(form, "title").slice(0, 200);
  const kind = validKind(s(form, "kind"));
  return {
    kind,
    title,
    url,
    store,
    price: parseMoney(form.get("price")),
    image_url: /^https?:\/\//.test(image) || isUploadUrl(image) ? image : "",
    notes: s(form, "notes").slice(0, 1000),
    priority: Math.min(3, Math.max(1, n(form, "priority") || 2)),
    quantity: Math.min(99, Math.max(1, n(form, "quantity") || 1)),
    category: validCategory(s(form, "category")) || (kind === "product" ? guessCategory(title, store) : "experiences"),
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
