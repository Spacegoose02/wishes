import "server-only";
import { all, get, run, tx } from "./db";
import type { Item } from "./types";

// Group gifts: shoppers chip in toward one wish until its price is covered.
// Pledges are a shopper-side detail, so the person the list is for never sees them.

export type Pledge = { id: number; item_id: number; user_id: number; amount_cents: number; name: string; avatar: string };
export type Progress = { goal: number; total: number; remaining: number; pct: number; full: boolean };

export function pledgeProgress(goalCents: number, pledges: { amount_cents: number }[]): Progress {
  const total = pledges.reduce((s, p) => s + p.amount_cents, 0);
  const goal = Math.max(0, goalCents);
  return {
    goal,
    total,
    remaining: Math.max(0, goal - total),
    pct: goal ? Math.min(100, Math.round((total / goal) * 100)) : 0,
    full: goal > 0 && total >= goal,
  };
}

// What chipping in for a wish should cover: its price times how many they want.
export function pledgeGoal(item: Pick<Item, "price_cents" | "quantity">): number {
  return (item.price_cents ?? 0) * Math.max(1, item.quantity);
}

export function pledgesForList(listId: number): Pledge[] {
  return all<Pledge>(
    `SELECT pl.id, pl.item_id, pl.user_id, pl.amount_cents, u.name, u.avatar FROM pledges pl
     JOIN items i ON i.id = pl.item_id JOIN users u ON u.id = pl.user_id
     WHERE i.list_id = ? ORDER BY pl.created_at`,
    listId,
  );
}

// Set (or with 0, withdraw) one person's pledge. Never lets the total run past the goal.
export function setPledge(item: Item, userId: number, amountCents: number): { amount: number; progress: Progress; justFunded: boolean } {
  return tx(() => {
    const goal = pledgeGoal(item);
    const others = get<{ t: number }>("SELECT COALESCE(SUM(amount_cents), 0) AS t FROM pledges WHERE item_id = ? AND user_id != ?", item.id, userId)!.t;
    const before = others + (get<{ amount_cents: number }>("SELECT amount_cents FROM pledges WHERE item_id = ? AND user_id = ?", item.id, userId)?.amount_cents ?? 0);
    const amount = Math.max(0, Math.min(Math.round(amountCents), goal - others));
    if (amount > 0) {
      run(
        "INSERT INTO pledges (item_id, user_id, amount_cents) VALUES (?, ?, ?) ON CONFLICT(item_id, user_id) DO UPDATE SET amount_cents = excluded.amount_cents",
        item.id, userId, amount,
      );
    } else {
      run("DELETE FROM pledges WHERE item_id = ? AND user_id = ?", item.id, userId);
    }
    const progress = pledgeProgress(goal, [{ amount_cents: others + amount }]);
    return { amount, progress, justFunded: progress.full && before < goal };
  });
}

export function pledgers(itemId: number): number[] {
  return all<{ user_id: number }>("SELECT user_id FROM pledges WHERE item_id = ?", itemId).map((r) => r.user_id);
}
