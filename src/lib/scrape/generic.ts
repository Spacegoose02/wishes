// Store-agnostic product extraction: JSON-LD, OpenGraph, and microdata.

export type Parsed = { title?: string; price_cents?: number; currency?: string; image_url?: string; description?: string };

export function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

export function toCents(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).replace(/[^0-9.,]/g, "");
  if (!s) return undefined;
  // "1,299.99" -> 1299.99 ; "1.299,99" -> 1299.99
  const normalized = /,\d{2}$/.test(s) && !/\.\d{2}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  const n = parseFloat(normalized);
  return Number.isFinite(n) && n > 0 && n < 1_000_000 ? Math.round(n * 100) : undefined;
}

function meta(html: string, key: string): string | undefined {
  const re1 = new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${key}["'][^>]*content=["']([^"']*)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name|itemprop)=["']${key}["']`, "i");
  const m = html.match(re1) || html.match(re2);
  return m ? decodeEntities(m[1]) : undefined;
}

type Json = Record<string, unknown>;

function findProduct(node: unknown): Json | undefined {
  if (!node || typeof node !== "object") return undefined;
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = findProduct(n);
      if (f) return f;
    }
    return undefined;
  }
  const o = node as Json;
  const t = o["@type"];
  if (t === "Product" || (Array.isArray(t) && t.includes("Product")) || t === "ProductGroup") return o;
  for (const k of ["@graph", "mainEntity", "itemListElement"]) {
    const f = findProduct(o[k]);
    if (f) return f;
  }
  return undefined;
}

function offerPrice(offers: unknown): { price?: number; currency?: string } {
  const list = Array.isArray(offers) ? offers : offers ? [offers] : [];
  for (const raw of list) {
    const o = raw as Json;
    const spec = o.priceSpecification as Json | undefined;
    const p = toCents(o.price ?? o.lowPrice ?? spec?.price);
    if (p) return { price: p, currency: (o.priceCurrency ?? spec?.priceCurrency) as string | undefined };
    if (o.offers) return offerPrice(o.offers);
  }
  return {};
}

export function parseJsonLd(html: string): Parsed {
  const scripts = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const m of scripts) {
    try {
      const product = findProduct(JSON.parse(m[1].trim()));
      if (!product) continue;
      let { price, currency } = offerPrice(product.offers);
      if (!price && Array.isArray(product.hasVariant)) ({ price, currency } = offerPrice((product.hasVariant[0] as Json)?.offers));
      const img = product.image;
      const image = typeof img === "string" ? img : Array.isArray(img) ? (typeof img[0] === "string" ? img[0] : (img[0] as Json)?.url) : (img as Json)?.url;
      return {
        title: product.name as string | undefined,
        description: typeof product.description === "string" ? product.description.slice(0, 500) : undefined,
        price_cents: price,
        currency,
        image_url: image as string | undefined,
      };
    } catch {
      /* malformed block, keep looking */
    }
  }
  return {};
}

export function parseGeneric(html: string): Parsed {
  const ld = parseJsonLd(html);
  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1];
  return {
    title: ld.title || meta(html, "og:title") || meta(html, "twitter:title") || (titleTag ? decodeEntities(titleTag) : undefined),
    price_cents:
      ld.price_cents ||
      toCents(meta(html, "product:price:amount") || meta(html, "og:price:amount") || meta(html, "price") || meta(html, "twitter:data1")),
    currency: ld.currency || meta(html, "product:price:currency") || meta(html, "og:price:currency") || meta(html, "priceCurrency"),
    image_url: ld.image_url || meta(html, "og:image") || meta(html, "twitter:image"),
    description: ld.description || meta(html, "og:description") || meta(html, "description"),
  };
}
