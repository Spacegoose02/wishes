"use server";
import { all, get, run } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canEditProfile, getList, isManager, isRecipient, listAccess } from "@/lib/access";
import { aiEnabled, converse, type ChatTurn } from "@/lib/ai";
import { parseReply, systemPrompt, type ChatIdea, type ProfileTip } from "@/lib/giftchat";
import { bestMatches, searchStores } from "@/lib/scrape/search";
import { storeSearch } from "@/lib/scrape/stores";
import { guessCategory, validCategory } from "@/lib/categories";
import type { Profile } from "@/lib/types";

export type ChatView = { id: number; role: "user" | "assistant"; body: string; ideas: ChatIdea[]; tip?: ProfileTip };

async function context(listId: number) {
  const user = await requireUser();
  const list = getList(listId);
  if (!list || listAccess(user, list) === "none") throw new Error("List not found");
  const profile = get<Profile>("SELECT * FROM profiles WHERE id = ?", list.profile_id)!;
  return { user, list, profile };
}

export async function loadChat(listId: number): Promise<ChatView[]> {
  const { user, list } = await context(listId);
  return all<{ id: number; role: "user" | "assistant"; content: string }>(
    "SELECT id, role, content FROM chat_messages WHERE list_id = ? AND user_id = ? ORDER BY id", list.id, user.id,
  ).map((m) => (m.role === "assistant" ? { id: m.id, role: m.role, ...parseReply(m.content) } : { id: m.id, role: m.role, body: m.content, ideas: [] }));
}

export async function sendChat(listId: number, text: string): Promise<{ ok: true; messages: ChatView[] } | { ok: false; error: string }> {
  const { user, list, profile } = await context(listId);
  const msg = text.trim().slice(0, 2000);
  if (!msg) return { ok: false, error: "Type a message first." };
  if (!aiEnabled()) return { ok: false, error: "Bandit needs AI turned on in Settings → Server." };
  run("INSERT INTO chat_messages (list_id, user_id, role, content) VALUES (?, ?, 'user', ?)", list.id, user.id, msg);
  const history = all<ChatTurn>(
    "SELECT role, content FROM (SELECT id, role, content FROM chat_messages WHERE list_id = ? AND user_id = ? ORDER BY id DESC LIMIT 30) ORDER BY id",
    list.id, user.id,
  );
  try {
    const reply = await converse(systemPrompt(list, profile, user.name, isRecipient(user.id, list)), history);
    run("INSERT INTO chat_messages (list_id, user_id, role, content) VALUES (?, ?, 'assistant', ?)", list.id, user.id, reply || "Sorry, I lost my train of thought. Could you say that again?");
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  return { ok: true, messages: await loadChat(list.id) };
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
