import "server-only";
import { all, get, run } from "./db";
import { daysUntil } from "./format";
import { notify } from "./prices";
import type { ListWithOwner } from "./access";

// After the big day, the list's people get to see what they got and say thanks.

export const STICKERS = ["🙏", "❤️", "🤩", "🥳", "🤗", "🎉", "🦝", "🪿"];

export type RevealGift = {
  purchase_id: number;
  item_title: string;
  image_url: string;
  category: string;
  buyer_user_id: number | null;
  buyer_name: string;
  thanked: string | null; // the sticker, once a thank-you went out
};

// Opens on the event day itself, so gifts can be revealed as they're unwrapped.
export function revealOpen(list: Pick<ListWithOwner, "event_date">, now = Date.now()): boolean {
  const d = daysUntil(list.event_date, now);
  return d !== undefined && d <= 0;
}

// Confirmed gifts from other people (not things the person marked "got it myself").
export function revealGifts(list: ListWithOwner): RevealGift[] {
  return all<RevealGift>(
    `SELECT pu.id AS purchase_id, pu.item_title, COALESCE(i.image_url, '') AS image_url, COALESCE(i.category, '') AS category,
            pu.buyer_user_id, pu.buyer_name, t.sticker AS thanked
     FROM purchases pu LEFT JOIN items i ON i.id = pu.item_id LEFT JOIN thanks t ON t.purchase_id = pu.id
     WHERE pu.list_id = ? AND pu.status = 'confirmed' AND (pu.buyer_user_id IS NULL OR pu.buyer_user_id != ?)
     ORDER BY pu.created_at`,
    list.id, list.owner_user_id,
  );
}

export function sendThanks(
  list: ListWithOwner, purchaseId: number, fromUserId: number, sticker: string, note: string,
): { ok: true; to: number } | { ok: false; error: string } {
  const gift = revealGifts(list).find((g) => g.purchase_id === purchaseId);
  if (!gift) return { ok: false, error: "That gift isn't on this list." };
  if (!gift.buyer_user_id) return { ok: false, error: `${gift.buyer_name} doesn't have an account, so thank them in person!` };
  if (gift.thanked) return { ok: false, error: "You already said thanks for that one." };
  const s = STICKERS.includes(sticker) ? sticker : STICKERS[0];
  const text = note.trim().slice(0, 140);
  run(
    "INSERT INTO thanks (purchase_id, list_id, from_user_id, to_user_id, sticker, note) VALUES (?, ?, ?, ?, ?, ?)",
    purchaseId, list.id, fromUserId, gift.buyer_user_id, s, text,
  );
  notify(gift.buyer_user_id, "thanks", `${s} ${list.profile_name} says thank you for ${gift.item_title}!${text ? ` "${text}"` : ""}`, "/notifications");
  return { ok: true, to: gift.buyer_user_id };
}

export function thanksSent(userId: number): number {
  return get<{ n: number }>("SELECT COUNT(*) AS n FROM thanks WHERE from_user_id = ?", userId)!.n;
}
