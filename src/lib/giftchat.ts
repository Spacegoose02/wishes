import "server-only";
import { all } from "./db";
import { describeProfile } from "./profile";
import { daysUntil, formatMoney } from "./format";
import { CATEGORIES } from "./categories";
import { SEARCH_STORES } from "./scrape/stores";
import { myLists, sharedWithMe, type ListWithOwner } from "./access";
import { budgetLeft } from "./shopping";
import type { Profile, User } from "./types";

export type ChatIdea = { title: string; why: string; price?: number; store?: string; search?: string; category?: string };
export type ProfileTip = { likes?: string; dislikes?: string; note?: string };

export type GiverContext = {
  unclaimed: { title: string; price_cents: number | null; list_title: string; kind: string }[];
  budget?: { amount_cents: number; left_cents: number; occasion: string };
};

// For someone shopping for the list's person: wishes on that person's lists (that this
// shopper can see) nobody has claimed or bought yet, and the shopper's own budget for them.
// Never built for the person themselves, so their chats can't spoil anything.
export function giverContext(user: User, list: ListWithOwner): GiverContext {
  const lists = [...myLists(user.id), ...sharedWithMe(user.id)].filter((l) => l.profile_id === list.profile_id);
  const unclaimed = lists.flatMap((l) =>
    all<{ title: string; price_cents: number | null; kind: string }>(
      `SELECT title, price_cents, kind FROM items WHERE list_id = ? AND claimed_by IS NULL AND purchased = 0
       AND needs_approval = 0 AND archived_at IS NULL ORDER BY must_have DESC, priority DESC LIMIT 30`,
      l.id,
    ).map((i) => ({ ...i, list_title: l.title })),
  );
  const b = budgetLeft(user.id, list.profile_id, list.occasion, new Date().getFullYear());
  return { unclaimed, budget: b && { amount_cents: b.amount_cents, left_cents: b.left_cents, occasion: b.occasion } };
}

// The gift helper's brief. The person's own chats never see who claimed or bought anything,
// so a chat on your own list can't spoil a surprise; shoppers also get giverContext().
export function systemPrompt(list: ListWithOwner, profile: Profile, chatterName: string, isRecipient: boolean, giver?: GiverContext): string {
  const items = all<{ title: string; price_cents: number | null; priority: number }>(
    "SELECT title, price_cents, priority FROM items WHERE list_id = ? AND needs_approval = 0 AND archived_at IS NULL ORDER BY priority DESC LIMIT 60", list.id,
  );
  const days = daysUntil(list.event_date);
  return [
    `Your name is Bandit. You are a friendly raccoon (he/him) and the gift helper inside Wishes, a family wishlist app. You can be a little playful about being a raccoon who sniffs out the best gifts and deals, but keep it light. You are a warm, practical expert at choosing gifts, especially for kids: you know what is age-appropriate, what is popular right now, what holds attention past the first day, and what parents appreciate.`,
    isRecipient
      ? `You are talking with ${chatterName}, who is building their own wishlist. Help them think of things they'd love.`
      : `You are talking with ${chatterName}, who is shopping for ${profile.name} or helping build their list.`,
    `About ${profile.name}:\n${describeProfile(profile)}`,
    `The list is "${list.title}"${list.occasion ? ` for ${list.occasion}` : ""}${days !== undefined && days >= 0 ? `, ${days} days away` : ""}.`,
    ...(!isRecipient && giver ? [giverBrief(profile.name, giver)] : []),
    items.length
      ? `Already on the list (don't suggest these again):\n${items.map((i) => `- ${i.title}${i.price_cents ? ` (${formatMoney(i.price_cents)})` : ""}`).join("\n")}`
      : "The list is empty so far.",
    `How to help:
- Have a real conversation. If you don't know enough (age, interests, budget, what they already have), ask one or two short questions before suggesting.
- When you suggest gifts, name specific real products that are sold today (brand + product + model or set number), and say in one line why each fits. Three to five at a time is plenty.
- Respect the dislikes, the sizes and the budget. Mention the size to buy for clothes and shoes.
- Keep replies short and friendly, plain text with simple "-" bullets. No tables.`,
    `After your reply, if you suggested concrete products, add a fenced block exactly like this so the app can show buttons for them:
\`\`\`gifts
[{"title":"LEGO Botanicals Bonsai Tree 10281","why":"Calm build for a 12-year-old who loves plants","price":49.99,"store":"Amazon","search":"LEGO bonsai 10281","category":"toys"}]
\`\`\`
store must be one of: ${SEARCH_STORES.join(", ")}. category must be one of: ${CATEGORIES.map((c) => c.id).join(", ")}.`,
    `If the person tells you something lasting about ${profile.name} (a new interest, something to avoid, a size), also add:
\`\`\`profile
{"likes":"new interest to add","dislikes":"thing to avoid","note":"other lasting fact"}
\`\`\`
Only include the keys you learned. Never include either block when there's nothing to add.`,
  ].join("\n\n");
}

function giverBrief(name: string, g: GiverContext): string {
  const money = (c: number | null) => (c ? ` (${formatMoney(c)})` : "");
  const parts = [
    g.unclaimed.length
      ? `Wishes ${name} asked for that nobody has picked yet. When asked for ideas, suggest from these first (they're already on the list, so no gifts block for them), then add new ideas:\n${g.unclaimed.map((i) => `- ${i.title}${money(i.price_cents)}${i.kind === "fund" ? " [money fund: chip in any amount]" : ""}, on "${i.list_title}"`).join("\n")}`
      : `Everything on ${name}'s lists has been picked already, so focus on new ideas.`,
  ];
  if (g.budget) {
    parts.push(`The shopper's budget for ${name}${g.budget.occasion ? ` (${g.budget.occasion})` : ""} is ${formatMoney(g.budget.amount_cents)}, with ${formatMoney(g.budget.left_cents)} left this year. Keep suggestions within what's left unless they ask otherwise.`);
  }
  parts.push("Never say who else is buying or has bought anything.");
  return parts.join("\n");
}

function block(text: string, name: string): string | undefined {
  return text.match(new RegExp("```" + name + "\\s*([\\s\\S]*?)```"))?.[1];
}

export function parseReply(text: string): { body: string; ideas: ChatIdea[]; tip?: ProfileTip } {
  let ideas: ChatIdea[] = [];
  let tip: ProfileTip | undefined;
  try {
    const raw = block(text, "gifts");
    const v = raw ? JSON.parse(raw) : [];
    if (Array.isArray(v)) {
      ideas = v
        .filter((i) => i && typeof i.title === "string")
        .slice(0, 8)
        .map((i) => ({
          title: String(i.title).slice(0, 200),
          why: String(i.why ?? "").slice(0, 300),
          price: Number(i.price) || undefined,
          store: typeof i.store === "string" ? i.store : undefined,
          search: typeof i.search === "string" ? i.search.slice(0, 120) : undefined,
          category: typeof i.category === "string" ? i.category : undefined,
        }));
    }
  } catch {
    /* model wrote a malformed block; just show the text */
  }
  try {
    const raw = block(text, "profile");
    const v = raw ? JSON.parse(raw) : undefined;
    if (v && typeof v === "object") {
      tip = {
        likes: typeof v.likes === "string" ? v.likes.slice(0, 200) : undefined,
        dislikes: typeof v.dislikes === "string" ? v.dislikes.slice(0, 200) : undefined,
        note: typeof v.note === "string" ? v.note.slice(0, 200) : undefined,
      };
      if (!tip.likes && !tip.dislikes && !tip.note) tip = undefined;
    }
  } catch {
    /* ignore */
  }
  const body = text.replace(/```(gifts|profile)[\s\S]*?```/g, "").trim();
  return { body, ideas, tip };
}
