"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { get, run, tx } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canEditProfile, getList, isManager, isRecipient, listManagers } from "@/lib/access";
import { fetchProduct, type ProductInfo } from "@/lib/scrape";
import { compareItem } from "@/lib/compare";
import { formatMoney } from "@/lib/format";
import { notify } from "@/lib/prices";
import { approveItem, archiveWish, restoreWish, setMustHave } from "@/lib/wishes";
import { award } from "@/lib/rewards";
import type { Item, Profile } from "@/lib/types";
import { s, n, ownList, viewList, doAutofill, itemFields, insertItem, recomputePurchased, withPicture } from "./_shared";
import { guessCategory, validCategory } from "@/lib/categories";
import { extractUrls, mapLimit } from "@/lib/links";
import { storeFromHost } from "@/lib/scrape/stores";

const MAX_BULK_LINKS = 15;

export async function autofill(url: string): Promise<{ ok: true; info: ProductInfo & { category: string } } | { ok: false; error: string }> {
  await requireUser();
  return doAutofill(url);
}

export async function addItem(form: FormData) {
  const { user, list } = await ownList(n(form, "list_id"));
  const f = await withPicture(form, itemFields(form), `/lists/${list.id}`);
  if (!f.title) redirect(`/lists/${list.id}?error=Every+wish+needs+a+name`);
  insertItem(list.id, f);
  award(user.id, "first_wish");
  redirect(`/lists/${list.id}?ok=Added`);
}

export async function updateItem(form: FormData) {
  const item = get<Item>("SELECT * FROM items WHERE id = ?", n(form, "item_id"));
  if (!item) redirect("/");
  const { list } = await ownList(item.list_id);
  const f = await withPicture(form, itemFields(form), `/lists/${list.id}`);
  if (f.price && f.price !== item.price_cents) {
    run("INSERT INTO price_history (item_id, price_cents, store) VALUES (?, ?, ?)", item.id, f.price, `${f.store} (edited)`);
  }
  run(
    "UPDATE items SET title = ?, url = ?, store = ?, price_cents = ?, image_url = ?, notes = ?, priority = ?, quantity = ?, category = ?, variant = ?, color = ?, size = ?, kind = ? WHERE id = ?",
    f.title || item.title, f.url, f.store, f.price, f.image_url, f.notes, f.priority, f.quantity, f.category, f.variant, f.color, f.size, f.kind, item.id,
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
  if (action === "claim" && !item.claimed_by && !item.needs_approval) {
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

// Move a wish (with its purchases and price history) to another list the user manages.
export async function moveItem(form: FormData) {
  const item = get<Item>("SELECT * FROM items WHERE id = ?", n(form, "item_id"));
  if (!item) redirect("/");
  const { user, list: from } = await ownList(item.list_id);
  const to = getList(n(form, "to_list_id"));
  if (!to || !isManager(user.id, to)) redirect(`/lists/${from.id}?error=Pick+a+list+you+manage#item-${item.id}`);
  tx(() => {
    run("UPDATE items SET list_id = ? WHERE id = ?", to.id, item.id);
    run("UPDATE purchases SET list_id = ? WHERE item_id = ?", to.id, item.id);
  });
  redirect(`/lists/${from.id}?ok=${encodeURIComponent(`Moved to ${to.title}`)}`);
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

export async function toggleMustHave(form: FormData) {
  const item = get<Item>("SELECT * FROM items WHERE id = ?", n(form, "item_id"));
  if (!item) redirect("/");
  const { list } = await ownList(item.list_id);
  const r = setMustHave(item, s(form, "action") === "star");
  if (!r.ok) redirect(`/lists/${list.id}?error=${encodeURIComponent(r.error)}#item-${item.id}`);
  revalidatePath(`/lists/${list.id}`);
}

// Kid mode: a wish typed (or drawn) by a kid on a parent's device. It waits for a parent's OK.
export async function kidAddItem(form: FormData) {
  const user = await requireUser();
  const list = getList(n(form, "list_id"));
  const profile = list && get<Profile>("SELECT * FROM profiles WHERE id = ?", list.profile_id);
  if (!list || !profile || profile.is_primary || !canEditProfile(user.id, profile)) redirect("/");
  const back = `/kid/${profile.id}?list=${list.id}`;
  const title = s(form, "title").slice(0, 200);
  if (!title) redirect(`${back}&error=${encodeURIComponent("Tell us what you wish for!")}`);
  const f = await withPicture(form, { ...itemFields(form), title, category: validCategory(s(form, "category")) || "other" }, back);
  const id = insertItem(list.id, f, null, true);
  for (const uid of listManagers(list)) {
    notify(uid, "approval", `${profile.name} wished for ${title}. Approve it so shoppers can see it.`, `/lists/${list.id}#item-${id}`);
  }
  redirect(`${back}&ok=${encodeURIComponent("Wish sent! A grown-up will check it.")}`);
}

export async function approveWish(form: FormData) {
  const item = get<Item>("SELECT * FROM items WHERE id = ?", n(form, "item_id"));
  if (!item) redirect("/");
  const { list } = await ownList(item.list_id);
  approveItem(item.id);
  redirect(`/lists/${list.id}?ok=Approved#item-${item.id}`);
}

// Paste a pile of links; each one is looked up and added as its own wish.
export async function bulkAddItems(form: FormData) {
  const { user, list } = await ownList(n(form, "list_id"));
  const urls = extractUrls(s(form, "links"), MAX_BULK_LINKS);
  if (!urls.length) redirect(`/lists/${list.id}?error=${encodeURIComponent("No links found in that text.")}`);
  const found = await mapLimit(urls, 3, (u) => doAutofill(u));
  let thin = 0;
  urls.forEach((url, i) => {
    const r = found[i];
    const info = r.ok ? r.info : undefined;
    const store = info?.store || storeFromHost(new URL(url).hostname).name;
    if (!info?.title || !info.price_cents) thin++;
    insertItem(list.id, {
      title: (info?.title || `Wish from ${store || new URL(url).hostname}`).slice(0, 200),
      url, store,
      price: info?.price_cents ?? null,
      image_url: info?.image_url && /^https?:\/\//.test(info.image_url) ? info.image_url : "",
      notes: "", priority: 2, quantity: 1,
      category: info?.category || guessCategory(info?.title ?? "", store),
      variant: "", color: "", size: "",
    });
  });
  award(user.id, "first_wish");
  const msg = `Added ${urls.length} ${urls.length === 1 ? "wish" : "wishes"}${thin ? `; ${thin} need a name or price filled in` : ""}`;
  redirect(`/lists/${list.id}?ok=${encodeURIComponent(msg)}`);
}

// "Got it" or "don't want it anymore": the wish moves to the past-gifts archive.
export async function archiveItem(form: FormData) {
  const item = get<Item>("SELECT * FROM items WHERE id = ?", n(form, "item_id"));
  if (!item) redirect("/");
  const { list } = await ownList(item.list_id);
  const reason = s(form, "reason") === "unwanted" ? "unwanted" : "received";
  for (const uid of archiveWish(item, reason)) {
    notify(uid, "unwanted", `${list.profile_name} doesn't want ${item.title} anymore, so no need to get it.`, "/purchases");
  }
  redirect(`/lists/${list.id}?ok=${encodeURIComponent(reason === "received" ? "Yay! Moved to past gifts" : "Moved to past gifts")}`);
}

export async function restoreItem(form: FormData) {
  const item = get<Item>("SELECT * FROM items WHERE id = ?", n(form, "item_id"));
  if (!item) redirect("/");
  const { list } = await ownList(item.list_id);
  restoreWish(item.id);
  redirect(`/lists/${list.id}?ok=Back+on+the+list#item-${item.id}`);
}
