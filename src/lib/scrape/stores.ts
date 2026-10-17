// Per-store tweaks layered on top of the generic parser. Big retailers change markup often
// and may block server requests, so every adapter is best-effort.
import { decodeEntities, toCents, type Parsed } from "./generic";

export type StoreKey = "amazon" | "walmart" | "target" | "kohls" | "bestbuy" | "etsy" | "lego" | "other";

const STORES: { key: StoreKey; name: string; match: RegExp }[] = [
  { key: "amazon", name: "Amazon", match: /(^|\.)amazon\.|(^|\.)amzn\./ },
  { key: "walmart", name: "Walmart", match: /(^|\.)walmart\.com$/ },
  { key: "target", name: "Target", match: /(^|\.)target\.com$/ },
  { key: "kohls", name: "Kohl's", match: /(^|\.)kohls\.com$/ },
  { key: "bestbuy", name: "Best Buy", match: /(^|\.)bestbuy\.com$/ },
  { key: "etsy", name: "Etsy", match: /(^|\.)etsy\.com$/ },
  { key: "lego", name: "LEGO", match: /(^|\.)lego\.com$/ },
];

export function storeFromHost(host: string): { key: StoreKey; name: string } {
  const h = host.toLowerCase().replace(/^www\./, "");
  const s = STORES.find((s) => s.match.test(h));
  if (s) return s;
  const label = h.split(".").slice(-2, -1)[0] || h;
  return { key: "other", name: label.charAt(0).toUpperCase() + label.slice(1) };
}

function first(html: string, ...res: RegExp[]): string | undefined {
  for (const re of res) {
    const m = html.match(re);
    if (m?.[1]?.trim()) return decodeEntities(m[1]).trim();
  }
  return undefined;
}

function nextData(html: string): unknown {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return undefined;
  try {
    return JSON.parse(m[1]);
  } catch {
    return undefined;
  }
}

function dig(o: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), o);
}

export const adapters: Partial<Record<StoreKey, (html: string) => Parsed>> = {
  amazon(html) {
    // The buy-box price lives in the core price block; search there before the whole page.
    const anchor = ["corePriceDisplay_desktop_feature_div", "corePrice_feature_div", "apex_desktop", "corePrice_desktop"]
      .map((id) => html.indexOf(`id="${id}"`))
      .find((i) => i >= 0);
    const region = anchor !== undefined ? html.slice(anchor, anchor + 30000) : html;
    let price = toCents(first(html, /customerVisiblePrice\]\[amount\]" value="([\d.]+)"/));
    if (!price) {
      const whole = first(region, /class="a-price-whole">([\d,]+)/);
      const frac = first(region, /class="a-price-fraction">(\d+)/);
      if (whole) price = toCents(`${whole}.${frac ?? "00"}`);
    }
    if (!price) for (const m of region.matchAll(/class="a-offscreen">([^<]*)</g)) {
      price = toCents(m[1]);
      if (price) break;
    }
    return {
      title: first(html, /id="productTitle"[^>]*>([\s\S]*?)<\/span>/),
      price_cents: price ?? toCents(first(html, /"priceAmount":\s*([\d.]+)/, /id="priceblock_(?:our|deal|sale)price"[^>]*>([^<]+)</)),
      image_url: first(html, /data-old-hires="([^"]+)"/, /"hiRes":"([^"]+)"/, /id="landingImage"[^>]+src="([^"]+)"/),
    };
  },
  walmart(html) {
    const data = nextData(html);
    const product = dig(data, "props.pageProps.initialData.data.product") as Record<string, unknown> | undefined;
    const price = dig(product, "priceInfo.currentPrice.price");
    return {
      title: product?.name as string | undefined,
      price_cents: toCents(price),
      image_url: dig(product, "imageInfo.thumbnailUrl") as string | undefined,
    };
  },
  target(html) {
    return {
      price_cents: toCents(first(html, /\\?"current_retail\\?":\s*([\d.]+)/, /\\?"formatted_current_price\\?":\s*\\?"\$([\d.,]+)/)),
      title: first(html, /<h1[^>]*data-test="product-title"[^>]*>([^<]+)</),
    };
  },
  kohls(html) {
    return {
      price_cents: toCents(first(html, /"salePrice"\s*:\s*\{[^}]*"minPrice"\s*:\s*([\d.]+)/, /class="pdpprice-row2-main-text[^"]*"[^>]*>\s*\$([\d.,]+)/)),
    };
  },
};
