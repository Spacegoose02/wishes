import { CATEGORIES, validCategory } from "./categories";

// "Fill in from a screenshot": when there's no link to read, a picture of the product (a store
// app, a catalog page, a photo of a shelf tag) is read by the AI and turned into wish details.
// This file is the plain part (prompt, schema, cleaning up the reply) so it can be tested
// without calling a model.

export type Box = { x: number; y: number; w: number; h: number }; // fractions of the image, 0–1

export type ScreenshotInfo = {
  found: boolean;
  title: string;
  price_cents?: number;
  store: string;
  url: string;
  variant: string;
  color: string;
  size: string;
  category: string;
  notes: string;
  box?: Box;
};

export const SCREENSHOT_PROMPT = [
  "This is a screenshot or photo someone took of something they'd like on a gift wishlist (a store app, a website, a catalog page, a shelf tag, or the product itself).",
  "Read what is shown and fill in the wish details. Only use what you can see; leave a field as an empty string (or 0 for price) when it isn't shown. Don't invent prices or stores.",
  "title: the product's full name with brand and model or set number when shown (e.g. 'LEGO Botanicals Bonsai Tree 10281'). Keep it under 120 characters.",
  "price: the current selling price as a number in the shown currency (the sale price if there is one), or 0.",
  "store: the shop's name if a logo, app or website shows it (e.g. 'Target', 'Amazon'), otherwise ''.",
  "url: a full web address for the product if one is visible (e.g. in a browser address bar), otherwise ''.",
  "variant, color, size: the selected option shown (e.g. '64 GB', 'Navy', 'Kids M (8)'), otherwise ''.",
  `category: one of ${CATEGORIES.map((c) => c.id).join(", ")}.`,
  "notes: one short helpful sentence for the gift buyer (e.g. key features or which version), or ''.",
  "box: where the main product photo is in the image, as fractions of the image width and height (x and y are the top-left corner, w and h the size, all between 0 and 1). Use all zeros if there is no product photo.",
  "found: false if the image doesn't show anything that could go on a wishlist, or isn't appropriate for a family wishlist; true otherwise.",
].join("\n");

const str = { type: "string" } as const;
const num = { type: "number" } as const;
export const SCREENSHOT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["found", "title", "price", "store", "url", "variant", "color", "size", "category", "notes", "box"],
  properties: {
    found: { type: "boolean" },
    title: str, price: num, store: str, url: str, variant: str, color: str, size: str,
    category: { type: "string", enum: CATEGORIES.map((c) => c.id) },
    notes: str,
    box: { type: "object", additionalProperties: false, required: ["x", "y", "w", "h"], properties: { x: num, y: num, w: num, h: num } },
  },
};

const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const clamp01 = (v: unknown) => Math.min(1, Math.max(0, Number(v) || 0));

// Keeps only a box that's a sensible part of the picture (at least 5% each way).
export function cleanBox(b: unknown): Box | undefined {
  if (!b || typeof b !== "object") return undefined;
  const o = b as Record<string, unknown>;
  const x = clamp01(o.x), y = clamp01(o.y);
  const w = Math.min(clamp01(o.w), 1 - x), h = Math.min(clamp01(o.h), 1 - y);
  if (w < 0.05 || h < 0.05) return undefined;
  return { x, y, w, h };
}

// Turns the model's reply (strict JSON from Claude, best-effort JSON from other providers) into
// safe, trimmed form values.
export function parseScreenshotReply(text: string): ScreenshotInfo {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("The AI reply wasn't in the expected format.");
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(m[0]) as Record<string, unknown>;
  } catch {
    throw new Error("The AI reply wasn't in the expected format.");
  }
  const title = clean(d.title, 200);
  const price = Number(typeof d.price === "string" ? d.price.replace(/[^0-9.]/g, "") : d.price);
  const url = clean(d.url, 2000);
  return {
    found: d.found !== false && !!title,
    title,
    price_cents: price > 0 && price < 1_000_000 ? Math.round(price * 100) : undefined,
    store: clean(d.store, 40),
    url: /^https?:\/\/[^\s/]+\.[^\s]+/i.test(url) ? url : "",
    variant: clean(d.variant, 80),
    color: clean(d.color, 40),
    size: clean(d.size, 40),
    category: validCategory(clean(d.category, 20)),
    notes: clean(d.notes, 300),
    box: cleanBox(d.box),
  };
}

// The pixel rectangle to cut out of a width × height image for a Box, padded a little so the
// product isn't cropped tight.
export function cropRect(box: Box, width: number, height: number, pad = 0.02): { sx: number; sy: number; sw: number; sh: number } {
  const x0 = Math.max(0, box.x - pad), y0 = Math.max(0, box.y - pad);
  const x1 = Math.min(1, box.x + box.w + pad), y1 = Math.min(1, box.y + box.h + pad);
  const sx = Math.round(x0 * width), sy = Math.round(y0 * height);
  return { sx, sy, sw: Math.max(1, Math.round(x1 * width) - sx), sh: Math.max(1, Math.round(y1 * height) - sy) };
}
