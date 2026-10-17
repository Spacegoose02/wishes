export const CATEGORIES = [
  { id: "electronics", label: "Electronics", icon: "🎧" },
  { id: "clothes", label: "Clothes & Shoes", icon: "👕" },
  { id: "toys", label: "Toys", icon: "🧸" },
  { id: "games", label: "Games", icon: "🎮" },
  { id: "fragrance", label: "Perfume & Cologne", icon: "🌸" },
  { id: "beauty", label: "Beauty", icon: "💄" },
  { id: "books", label: "Books", icon: "📚" },
  { id: "home", label: "Home & Kitchen", icon: "🏠" },
  { id: "sports", label: "Sports & Outdoors", icon: "⚽" },
  { id: "jewelry", label: "Jewelry & Accessories", icon: "💍" },
  { id: "crafts", label: "Art & Crafts", icon: "🎨" },
  { id: "experiences", label: "Experiences & Gift cards", icon: "🎟️" },
  { id: "other", label: "Other", icon: "🎁" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export function categoryLabel(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? "";
}
export function categoryIcon(id: string): string {
  return CATEGORIES.find((c) => c.id === id)?.icon ?? "🎁";
}
export function validCategory(id: string): string {
  return CATEGORIES.some((c) => c.id === id) ? id : "";
}

// Cheap keyword guess so autofilled items land in a sensible category; always editable.
const RULES: [CategoryId, RegExp][] = [
  ["fragrance", /\b(perfume|cologne|eau de (parfum|toilette)|fragrance|body mist)\b/i],
  ["beauty", /\b(makeup|lipstick|mascara|skincare|serum|moisturi[sz]er|nail polish|palette|cosmetic|hair dryer|curling)\b/i],
  ["games", /\b(playstation|ps5|ps4|xbox|nintendo|switch|video game|board game|card game|puzzle)\b/i],
  ["electronics", /\b(headphones?|earbuds?|airpods|speaker|tablet|ipad|laptop|macbook|phone|camera|tv|television|monitor|smart ?watch|kindle|charger|drone|keyboard|mouse)\b/i],
  ["toys", /\b(lego|toy|doll|plush|stuffed|action figure|playset|hot wheels|barbie|nerf|squishmallow|kids?)\b/i],
  ["clothes", /\b(shirt|t-shirt|tee|hoodie|sweater|jacket|coat|dress|pants|jeans|leggings|shorts|skirt|socks|pajamas|shoes?|sneakers?|boots?|sandals|hat|beanie|gloves|scarf)\b/i],
  ["jewelry", /\b(necklace|bracelet|earrings?|ring|watch|wallet|purse|handbag|backpack|sunglasses)\b/i],
  ["books", /\b(book|novel|hardcover|paperback|kindle edition|journal|comic|manga)\b/i],
  ["home", /\b(blanket|pillow|mug|kitchen|cookware|knife|blender|air fryer|candle|lamp|decor|towel|bedding|vacuum)\b/i],
  ["sports", /\b(bike|bicycle|scooter|ball|tent|camping|yoga|fitness|dumbbell|skateboard|fishing|golf)\b/i],
  ["crafts", /\b(paint|markers?|crayons?|sketch|craft|yarn|knitting|sewing|easel|clay)\b/i],
  ["experiences", /\b(gift card|tickets?|membership|subscription|class|lesson)\b/i],
];

export function guessCategory(title: string, store = ""): string {
  if (/sephora|ulta/i.test(store)) return /\b(perfume|cologne|eau de)\b/i.test(title) ? "fragrance" : "beauty";
  for (const [id, re] of RULES) if (re.test(title)) return id;
  return "";
}
