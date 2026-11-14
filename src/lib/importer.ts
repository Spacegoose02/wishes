// Bringing wishes in from elsewhere: a public Amazon wish list, or a spreadsheet (CSV) such
// as the one Wishes exports. Pure parsing here; fetching and saving live in the action.
import { decodeEntities, toCents } from "./scrape/generic";
import { validCategory } from "./categories";

export const MAX_IMPORT = 200;

export type ImportedWish = {
  title: string; url: string; price_cents: number | null; image_url: string; notes: string;
  priority: number; quantity: number; category: string; color: string; size: string; variant: string;
};

const blank = (title: string): ImportedWish => ({
  title, url: "", price_cents: null, image_url: "", notes: "", priority: 2, quantity: 1, category: "", color: "", size: "", variant: "",
});

// --- Amazon wish lists ---

// The list's own address on the same Amazon site, or null if it isn't an Amazon wish list.
export function amazonListUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (!/(^|\.)amazon\.[a-z.]+$/.test(u.hostname)) return null;
  const id = u.pathname.match(/\/(?:hz\/wishlist\/ls|gp\/registry\/wishlist|wishlist)\/([A-Z0-9]{8,16})/i)?.[1];
  if (!id) return null;
  return new URL(`https://${u.hostname}/hz/wishlist/ls/${id.toUpperCase()}?viewType=list`);
}

function attr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`\\s${name}=["']([^"']*)["']`, "i"));
  return m ? decodeEntities(m[1]) : undefined;
}

// One page of an Amazon wish list: its items, and the address of the next page if there is one.
export function parseAmazonList(html: string, base: URL): { wishes: ImportedWish[]; next?: URL } {
  const wishes: ImportedWish[] = [];
  const blocks = html.split(/<li\b(?=[^>]*data-itemid=)/i).slice(1);
  for (const block of blocks) {
    const li = block.slice(0, block.indexOf(">") + 1);
    const link = block.match(/<a\b[^>]*id=["']itemName_[^"']*["'][^>]*>/i)?.[0];
    if (!link) continue;
    const title = (attr(link, "title") || decodeEntities(block.match(/id=["']itemName_[^"']*["'][^>]*>([^<]+)</i)?.[1] ?? "")).trim();
    if (!title) continue;
    const href = attr(link, "href");
    let url = "";
    if (href) {
      const full = new URL(href, base);
      const asin = full.pathname.match(/\/dp\/([A-Z0-9]{10})/i)?.[1];
      url = asin ? `https://${base.hostname}/dp/${asin}` : full.toString();
    }
    const price = attr(li, "data-price");
    const img = block.match(/<img\b[^>]*src=["'](https:\/\/[^"']+)["']/i)?.[1];
    const wanted = Number(block.match(/id=["']itemRequested_[^"']*["'][^>]*>\s*(\d+)/i)?.[1]);
    const comment = block.match(/id=["']itemComment_[^"']*["'][^>]*>([^<]*)</i)?.[1];
    wishes.push({
      ...blank(title.slice(0, 200)),
      url,
      price_cents: price && Number(price) > 0 ? toCents(price) ?? null : null,
      image_url: img ? decodeEntities(img) : "",
      quantity: wanted > 0 && wanted < 100 ? wanted : 1,
      notes: comment ? decodeEntities(comment).trim().slice(0, 1000) : "",
    });
  }
  const more = html.match(/name=["']showMoreUrl["'][^>]*value=["']([^"']+)["']/i)?.[1] ?? html.match(/value=["']([^"']+)["'][^>]*name=["']showMoreUrl["']/i)?.[1];
  const next = more ? new URL(decodeEntities(more), base) : undefined;
  return { wishes, next: next && next.hostname === base.hostname ? next : undefined };
}

// --- CSV ---

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  // Spreadsheets in some countries use semicolons; go by whichever the header uses more.
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

const HEADERS: Record<string, keyof ImportedWish> = {
  title: "title", name: "title", wish: "title", item: "title", product: "title",
  url: "url", link: "url", address: "url",
  price: "price_cents", cost: "price_cents",
  notes: "notes", note: "notes", comment: "notes", comments: "notes", description: "notes",
  priority: "priority", stars: "priority", "how much": "priority",
  quantity: "quantity", qty: "quantity", how_many: "quantity",
  image: "image_url", image_url: "image_url", picture: "image_url", photo: "image_url",
  category: "category", color: "color", colour: "color", size: "size", variant: "variant", style: "variant", type: "variant",
};

export function wishesFromCsv(text: string): ImportedWish[] {
  const [head, ...rows] = parseCsv(text);
  if (!head) return [];
  const cols = head.map((h) => HEADERS[h.trim().toLowerCase().replace(/\s+/g, " ")]);
  // No recognizable header: treat the first column as the name and keep the first row too.
  const known = cols.some((c) => c === "title");
  const data = known ? rows : [head, ...rows];
  const at = (name: keyof ImportedWish) => (known ? cols.indexOf(name) : name === "title" ? 0 : -1);
  const out: ImportedWish[] = [];
  for (const r of data.slice(0, MAX_IMPORT)) {
    const get = (name: keyof ImportedWish) => (at(name) >= 0 ? (r[at(name)] ?? "").trim() : "");
    const title = get("title").slice(0, 200);
    if (!title) continue;
    const url = get("url");
    const img = get("image_url");
    const pr = Number(get("priority"));
    const qty = Number(get("quantity"));
    out.push({
      ...blank(title),
      url: /^https?:\/\//i.test(url) ? url : "",
      price_cents: toCents(get("price_cents")) ?? null,
      image_url: /^https:\/\//i.test(img) ? img : "",
      notes: get("notes").slice(0, 1000),
      priority: pr >= 1 && pr <= 3 ? Math.round(pr) : 2,
      quantity: qty >= 1 && qty < 100 ? Math.round(qty) : 1,
      category: validCategory(get("category").toLowerCase()) || "",
      color: get("color").slice(0, 60),
      size: get("size").slice(0, 60),
      variant: get("variant").slice(0, 100),
    });
  }
  return out;
}

// --- Export ---

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  // A leading = + - @ would be run as a formula by spreadsheet apps.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export const EXPORT_COLUMNS = ["list", "for", "title", "url", "store", "price", "notes", "priority", "quantity", "category", "color", "size", "variant", "must_have", "status"] as const;

export function toCsv(rows: Record<(typeof EXPORT_COLUMNS)[number], unknown>[]): string {
  return [EXPORT_COLUMNS.join(","), ...rows.map((r) => EXPORT_COLUMNS.map((c) => csvCell(r[c])).join(","))].join("\r\n") + "\r\n";
}
