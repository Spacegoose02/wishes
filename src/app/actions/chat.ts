"use server";
import { get, run } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canEditProfile, getList, isManager, listAccess } from "@/lib/access";
import type { ChatIdea, ProfileTip } from "@/lib/giftchat";
import { chatViews } from "@/lib/chatstore";
import { bestMatches, searchStores } from "@/lib/scrape/search";
import { storeSearch } from "@/lib/scrape/stores";
import { guessCategory, validCategory } from "@/lib/categories";
import type { Profile } from "@/lib/types";

export type ChatView = { id: number; role: "user" | "assistant"; body: string; ideas: ChatIdea[]; tip?: ProfileTip; stopped?: boolean };

async function context(listId: number) {
  const user = await requireUser();
  const list = getList(listId);
  if (!list || listAccess(user, list) === "none") throw new Error("List not found");
  const profile = get<Profile>("SELECT * FROM profiles WHERE id = ?", list.profile_id)!;
  return { user, list, profile };
}

export async function loadChat(listId: number): Promise<ChatView[]> {
  const { user, list } = await context(listId);
  return chatViews(list.id, user.id);
}

export async function clearChat(listId: number): Promise<ChatView[]> {
  const { user, list } = await context(listId);
  run("DELETE FROM chat_messages WHERE list_id = ? AND user_id = ?", list.id, user.id);
  return [];
}

// Send a chat idea to the list's review queue, looked up at Walmart/Amazon first so it arrives
// with a real link, price and photo when one matches.
export async function chatIdeaToReview(listId: number, idea: ChatIdea): Promise<{ ok: boolean; message: string }> {
  const { user, list } = await context(listId);
  if (!isManager(user.id, list)) return { ok: false, message: "Only the list's managers can add ideas to it." };
  const query = idea.search || idea.title;
  const found = await searchStores(query, /walmart/i.test(idea.store ?? "") ? ["Walmart", "Amazon"] : ["Amazon", "Walmart"]).catch(() => []);
  const hit = bestMatches(idea.title, found, 0.5)[0] ?? bestMatches(query, found, 0.6)[0];
  const fallback = storeSearch(idea.store, query);
  run(
    "INSERT INTO suggestions (list_id, title, reason, est_price_cents, source, store, category, url, image_url) VALUES (?, ?, ?, ?, 'chat', ?, ?, ?, ?)",
    list.id, (hit?.title ?? idea.title).slice(0, 200), idea.why, hit?.price_cents ?? (idea.price ? Math.round(idea.price * 100) : null),
    hit?.store ?? fallback.store, validCategory(idea.category ?? "") || guessCategory(idea.title), hit?.url ?? fallback.url, hit?.image_url ?? "",
  );
  return { ok: true, message: hit ? `Added to ideas for review (found at ${hit.store}).` : "Added to ideas for review." };
}

// Save something the helper learned (a new interest, a no-go) onto the person's profile.
export async function saveChatTip(listId: number, tip: ProfileTip): Promise<{ ok: boolean; message: string }> {
  const { user, profile } = await context(listId);
  if (!canEditProfile(user.id, profile)) return { ok: false, message: `You can't edit ${profile.name}'s profile.` };
  const add = (cur: string, extra?: string) => (extra ? (cur ? `${cur}, ${extra}` : extra).slice(0, 600) : cur);
  run(
    "UPDATE profiles SET likes = ?, dislikes = ?, gift_notes = ? WHERE id = ?",
    add(profile.likes, tip.likes), add(profile.dislikes, tip.dislikes), tip.note ? `${profile.gift_notes ? profile.gift_notes + "; " : ""}${tip.note}`.slice(0, 600) : profile.gift_notes, profile.id,
  );
  return { ok: true, message: `Saved to ${profile.name}'s profile.` };
}
