import "server-only";
import { adapters, storeFromHost } from "./stores";
import { decodeEntities, parseGeneric } from "./generic";

export type ProductInfo = {
  title?: string;
  price_cents?: number;
  currency?: string;
  image_url?: string;
  description?: string;
  store: string;
  url: string;
  blocked?: boolean;
};

const BLOCKED = /just a moment|attention required|access denied|robot check|are you a human|captcha|verify you are human|pardon our interruption|request blocked|page not found/i;

const UA =
  process.env.SCRAPE_USER_AGENT ||
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";

export function normalizeUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim().match(/^https?:\/\//i) ? raw.trim() : `https://${raw.trim()}`);
    if (!/^https?:$/.test(u.protocol)) return null;
    return u;
  } catch {
    return null;
  }
}

// Refuse to fetch internal addresses so the autofill can't be used to probe the LAN.
function isPrivateHost(host: string): boolean {
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (/^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) return true;
  if (host.startsWith("[") || host === "::1") return true;
  return false;
}

export async function fetchProduct(rawUrl: string): Promise<ProductInfo> {
  const url = normalizeUrl(rawUrl);
  if (!url) throw new Error("That doesn't look like a link.");
  if (isPrivateHost(url.hostname)) throw new Error("Private network addresses can't be autofilled.");
  const store = storeFromHost(url.hostname);
  const base: ProductInfo = { store: store.name, url: url.toString() };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  let html = "";
  let status = 0;
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      cache: "no-store",
      headers: {
        "user-agent": UA,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
      },
    });
    status = res.status;
    html = (await res.text()).slice(0, 3_000_000);
  } catch {
    return { ...base, title: titleFromPath(url), blocked: true };
  } finally {
    clearTimeout(timer);
  }

  // Bot walls (Cloudflare, Akamai, Amazon captcha) return a page with nothing useful.
  if (status >= 400 || BLOCKED.test(html.slice(0, 20000).match(/<title[^>]*>([^<]*)/i)?.[1] ?? "")) {
    return { ...base, title: titleFromPath(url), blocked: true };
  }
  const generic = parseGeneric(html);
  const specific = adapters[store.key]?.(html) ?? {};
  const merged: ProductInfo = { ...base, ...stripEmpty(generic), ...stripEmpty(specific) };
  if (!merged.title) merged.title = titleFromPath(url);
  if (merged.title) merged.title = decodeEntities(merged.title).replace(/\s+/g, " ").trim().slice(0, 200);
  if (merged.image_url) merged.image_url = new URL(merged.image_url, url).toString();
  return merged;
}

function stripEmpty<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "")) as Partial<T>;
}

function titleFromPath(url: URL): string | undefined {
  const seg = url.pathname.split("/").filter(Boolean).find((s) => s.includes("-") && s.length > 8 && (s.match(/[a-z]/gi)?.length ?? 0) > s.length / 2);
  return seg ? decodeURIComponent(seg).replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : undefined;
}

// --- Cross-store price checking (extension point) ---
// A PriceSource finds offers for a product at another store. Register sources here
// (e.g. a retailer API, a SerpAPI/Google Shopping key, or a self-hosted search) and the
// price refresher will record the lowest one.
export type Offer = { store: string; url: string; price_cents: number };
export interface PriceSource {
  name: string;
  search(query: string): Promise<Offer[]>;
}
export const priceSources: PriceSource[] = [];
