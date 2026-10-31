import "server-only";
import { get, run } from "./db";
import { notify } from "./prices";

// Badges for nice things people do. Each one earns a golden critter roll, once.

export const BADGES = {
  first_wish: { icon: "🌟", label: "First wish" },
  first_gift: { icon: "🛍️", label: "First gift bought" },
  thank_you: { icon: "💌", label: "Said thank you" },
  santa_done: { icon: "🎅", label: "Secret Santa sorted" },
} as const;
export type Badge = keyof typeof BADGES;

export function parseBadges(raw: string | null | undefined): Badge[] {
  return (raw ?? "").split(",").filter((b): b is Badge => b in BADGES);
}

// Returns true when the badge is new (and a golden roll was added).
export function award(userId: number, badge: Badge): boolean {
  const row = get<{ badges: string }>("SELECT badges FROM users WHERE id = ?", userId);
  if (!row) return false;
  const have = parseBadges(row.badges);
  if (have.includes(badge)) return false;
  run("UPDATE users SET badges = ?, bonus_rolls = bonus_rolls + 1 WHERE id = ?", [...have, badge].join(","), userId);
  const b = BADGES[badge];
  notify(userId, "badge", `${b.icon} New badge: ${b.label}! You earned a golden critter roll.`, "/settings?tab=me");
  return true;
}

// Spend one golden roll; false when there are none left.
export function spendBonusRoll(userId: number): boolean {
  return Number(run("UPDATE users SET bonus_rolls = bonus_rolls - 1 WHERE id = ? AND bonus_rolls > 0", userId).changes) === 1;
}
