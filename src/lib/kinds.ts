// Not every wish is a thing in a store. Funds collect pledges toward a goal (see pledges.ts).

export const WISH_KINDS = [
  { id: "product", label: "A thing", icon: "🎁", price: "Price" },
  { id: "experience", label: "An experience", icon: "🎟️", price: "About how much" },
  { id: "gift_card", label: "A gift card", icon: "💳", price: "Amount" },
  { id: "fund", label: "A money fund", icon: "🏦", price: "Goal" },
] as const;

export type WishKind = (typeof WISH_KINDS)[number]["id"];

export function validKind(v: string): WishKind {
  return WISH_KINDS.some((k) => k.id === v) ? (v as WishKind) : "product";
}

export function kindInfo(id: string) {
  return WISH_KINDS.find((k) => k.id === id) ?? WISH_KINDS[0];
}

// Funds are reached together through pledges rather than claimed and bought by one person.
export function isFund(kind: string): boolean {
  return kind === "fund";
}
