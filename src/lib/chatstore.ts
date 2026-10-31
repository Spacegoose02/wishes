import "server-only";
import { all, get, getSetting, run } from "./db";
import { estimateCost, type Usage } from "./ai";
import { parseReply, type ChatIdea, type ProfileTip } from "./giftchat";
import type { ChatView } from "@/app/actions/chat";

type Row = { id: number; role: "user" | "assistant"; content: string; meta: string | null };
type Meta = { ideas?: ChatIdea[]; tip?: ProfileTip; stopped?: boolean };

function toView(m: Row): ChatView {
  if (m.role === "user") return { id: m.id, role: "user", body: m.content, ideas: [] };
  // Older replies kept their cards in fenced blocks inside the text.
  if (!m.meta) return { id: m.id, role: "assistant", ...parseReply(m.content) };
  const meta = JSON.parse(m.meta) as Meta;
  return { id: m.id, role: "assistant", body: m.content, ideas: meta.ideas ?? [], tip: meta.tip, stopped: meta.stopped };
}

export function chatViews(listId: number, userId: number): ChatView[] {
  return all<Row>("SELECT id, role, content, meta FROM chat_messages WHERE list_id = ? AND user_id = ? ORDER BY id", listId, userId).map(toView);
}

export function chatView(id: number): ChatView | undefined {
  const r = get<Row>("SELECT id, role, content, meta FROM chat_messages WHERE id = ?", id);
  return r && toView(r);
}

export function addUserMessage(listId: number, userId: number, text: string): number {
  return Number(run("INSERT INTO chat_messages (list_id, user_id, role, content) VALUES (?, ?, 'user', ?)", listId, userId, text).lastInsertRowid);
}

export function deleteMessage(id: number) {
  run("DELETE FROM chat_messages WHERE id = ?", id);
}

export function addAssistantMessage(listId: number, userId: number, r: { text: string; ideas: ChatIdea[]; tip?: ProfileTip; stopped?: boolean; model: string; usage: Usage }): number {
  const meta: Meta = { ideas: r.ideas, ...(r.tip ? { tip: r.tip } : {}), ...(r.stopped ? { stopped: true } : {}) };
  return Number(
    run(
      `INSERT INTO chat_messages (list_id, user_id, role, content, meta, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, web_searches)
       VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?, ?, ?)`,
      listId, userId, r.text, JSON.stringify(meta), r.model, r.usage.input, r.usage.output, r.usage.cacheRead, r.usage.cacheWrite, r.usage.webSearches,
    ).lastInsertRowid,
  );
}

export const DEFAULT_DAILY_CAP = 100;
// Messages a person can send Bandit per 24 hours. 0 means no limit.
export function dailyCap(): number {
  const raw = getSetting("chat_daily_cap");
  const v = Number(raw);
  return raw && Number.isInteger(v) && v >= 0 ? v : DEFAULT_DAILY_CAP;
}

// Messages this person sent Bandit in the last 24 hours, across all lists.
export function sentToday(userId: number): number {
  return get<{ n: number }>("SELECT COUNT(*) AS n FROM chat_messages WHERE user_id = ? AND role = 'user' AND created_at > unixepoch() - 86400", userId)!.n;
}

export type MonthUsage = { replies: number; cost: number; cacheShare: number; byModel: { model: string; replies: number; cost: number }[] };

// Bandit's estimated spend since the first of this month, for the Admin readout.
export function monthUsage(now = new Date()): MonthUsage {
  const since = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
  const rows = all<{ model: string; replies: number; input: number; output: number; cacheRead: number; cacheWrite: number; webSearches: number }>(
    `SELECT model, COUNT(*) AS replies, SUM(input_tokens) AS input, SUM(output_tokens) AS output, SUM(cache_read_tokens) AS cacheRead,
            SUM(cache_write_tokens) AS cacheWrite, SUM(web_searches) AS webSearches
     FROM chat_messages WHERE role = 'assistant' AND model != '' AND created_at >= ? GROUP BY model ORDER BY replies DESC`,
    since,
  );
  const byModel = rows.map((r) => ({ model: r.model, replies: r.replies, cost: estimateCost(r.model, r) }));
  const inputAll = rows.reduce((s, r) => s + r.input + r.cacheRead + r.cacheWrite, 0);
  return {
    replies: rows.reduce((s, r) => s + r.replies, 0),
    cost: byModel.reduce((s, r) => s + r.cost, 0),
    cacheShare: inputAll ? rows.reduce((s, r) => s + r.cacheRead, 0) / inputAll : 0,
    byModel,
  };
}
