"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { get, run } from "@/lib/db";
import { isManager, isRecipient, listManagers } from "@/lib/access";
import { formatMoney, parseMoney } from "@/lib/format";
import { notify } from "@/lib/prices";
import { pledgers, setPledge } from "@/lib/pledges";
import type { Item } from "@/lib/types";
import { s, n, ownList, viewList, recomputePurchased } from "./_shared";

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

// Chip in toward a group gift. An empty or zero amount withdraws your pledge.
export async function pledgeToItem(form: FormData) {
  const item = get<Item>("SELECT * FROM items WHERE id = ?", n(form, "item_id"));
  if (!item) redirect("/");
  const { user, list } = await viewList(item.list_id);
  if (isRecipient(user.id, list)) redirect(`/lists/${list.id}`);
  const back = (key: "ok" | "error", msg: string) => redirect(`/lists/${list.id}?${key}=${encodeURIComponent(msg)}#item-${item.id}`);
  if (!item.price_cents || item.purchased) return back("error", "This wish can't take pledges right now.");
  const { amount, progress, justFunded } = setPledge(item, user.id, parseMoney(form.get("amount")) ?? 0);
  if (justFunded) {
    for (const uid of pledgers(item.id)) {
      notify(uid, "pledge", `${item.title} is fully funded for ${list.profile_name}! Decide who buys it.`, `/lists/${list.id}#item-${item.id}`);
    }
  }
  back("ok", amount ? `You're chipping in ${formatMoney(amount)}${progress.full ? ". Fully funded!" : ` (${formatMoney(progress.remaining)} to go)`}` : "Pledge withdrawn");
}
