"use server";
import { redirect } from "next/navigation";
import { get, run } from "@/lib/db";
import { getList, isRecipient, listManagers } from "@/lib/access";
import { randomToken } from "@/lib/crypto";
import { parseMoney } from "@/lib/format";
import { notify } from "@/lib/prices";
import type { Item } from "@/lib/types";
import { s, n, ownList, doAutofill, itemFields, insertItem, recomputePurchased, guestByToken } from "./_shared";

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
