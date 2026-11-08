import "server-only";
import { all, get, run } from "./db";
import { isRecipient, listManagers, type ListWithOwner } from "./access";
import { notify } from "./notify";
import type { Item } from "./types";

// Anonymous questions about a wish: a shopper asks "which color?" and the list's people
// answer without finding out who's shopping. Askers are never shown to anyone.

export type Question = { id: number; item_id: number; question: string; answer: string; answered_at: number | null; mine: number; created_at: number };

export const MAX_QUESTION = 300;

const short = (t: string, n = 60) => (t.length > n ? t.slice(0, n - 3).trimEnd() + "…" : t);

export function askQuestion(item: Pick<Item, "id" | "title" | "surprise">, list: ListWithOwner, askerId: number, text: string): number | null {
  const q = text.trim().slice(0, MAX_QUESTION);
  if (!q || item.surprise || isRecipient(askerId, list)) return null;
  const id = Number(run("INSERT INTO item_questions (item_id, asker_id, question) VALUES (?, ?, ?)", item.id, askerId, q).lastInsertRowid);
  const link = `/lists/${list.id}#item-${item.id}`;
  for (const uid of listManagers(list)) {
    if (uid === askerId) continue;
    notify(uid, "question", isRecipient(uid, list)
      ? `Someone shopping for you asked about ${short(item.title)}: "${short(q, 120)}"`
      : `A shopper asked about ${short(item.title)} on ${list.profile_name}'s list: "${short(q, 120)}"`, link);
  }
  return id;
}

export function answerQuestion(id: number, list: ListWithOwner, text: string): boolean {
  const q = get<{ id: number; asker_id: number | null; question: string; item_id: number; title: string }>(
    "SELECT q.*, i.title FROM item_questions q JOIN items i ON i.id = q.item_id WHERE q.id = ? AND i.list_id = ?", id, list.id,
  );
  const a = text.trim().slice(0, MAX_QUESTION);
  if (!q || !a) return false;
  run("UPDATE item_questions SET answer = ?, answered_at = unixepoch() WHERE id = ?", a, id);
  if (q.asker_id) notify(q.asker_id, "answer", `About ${short(q.title)}: "${short(q.question, 80)}" → "${short(a, 120)}"`, `/lists/${list.id}#item-${q.item_id}`);
  return true;
}

export function questionOnList(id: number, listId: number): { id: number; asker_id: number | null } | undefined {
  return get("SELECT q.id, q.asker_id FROM item_questions q JOIN items i ON i.id = q.item_id WHERE q.id = ? AND i.list_id = ?", id, listId);
}

export function deleteQuestion(id: number) {
  run("DELETE FROM item_questions WHERE id = ?", id);
}

// Questions on a list's wishes, each marked if the viewer asked it (so they can take it back).
export function questionsForList(listId: number, viewerId: number): Map<number, Question[]> {
  const rows = all<Question>(
    `SELECT q.id, q.item_id, q.question, q.answer, q.answered_at, q.created_at, (q.asker_id = ?) AS mine
     FROM item_questions q JOIN items i ON i.id = q.item_id WHERE i.list_id = ? AND i.surprise = 0 ORDER BY q.created_at`,
    viewerId, listId,
  );
  const map = new Map<number, Question[]>();
  for (const r of rows) map.set(r.item_id, [...(map.get(r.item_id) ?? []), { ...r, mine: r.mine ? 1 : 0 }]);
  return map;
}

export function openQuestions(listId: number): number {
  return get<{ n: number }>(
    "SELECT COUNT(*) AS n FROM item_questions q JOIN items i ON i.id = q.item_id WHERE i.list_id = ? AND q.answered_at IS NULL AND i.archived_at IS NULL",
    listId,
  )!.n;
}
