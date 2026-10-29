import "server-only";
import { adapters, storeFromHost } from "./stores";
import { decodeEntities, parseGeneric } from "./generic";
import { getSetting } from "../db";

export type ProductInfo = {
  title?: string;
  price_cents?: number;
  currency?: string;
  image_url?: string;
  description?: string;
  store: string;
  url: string;
  // blocked: a bot wall answered; missing: the page is gone; unavailable: no seller right now
  problem?: "blocked" | "missing" | "unavailable";
  blocked?: boolean;
};

const BOT_WALL = /just a moment|attention required|access denied|robot check|are you a human|captcha|verify you are human|pardon our interruption|request blocked/i;
const MISSING = /^404\b|page not found|product not found|looking for something\?/i;

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

// Amazon product URLs come in many shapes (/dp/, /gp/product/, mobile /gp/aw/d/, long slugs
// with tracking). The plain /dp/ASIN page is the most reliable one to read.
function canonical(url: URL): URL {
  if (/(^|\.)amazon\./.test(url.hostname)) {
    const asin = url.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/asin)\/([A-Z0-9]{10})/i)?.[1];
    if (asin) return new URL(`https://${url.hostname}/dp/${asin.toUpperCase()}`);
  }
  return url;
}

function pageTitle(html: string): string {
  return decodeEntities(html.slice(0, 30000).match(/<title[^>]*>([^<]*)/i)?.[1] ?? "").trim();
}

function isBotWall(html: string): boolean {
  return (
    BOT_WALL.test(pageTitle(html)) ||
    /\/errors\/validateCaptcha|px-captcha|captcha-delivery|Click the button below to continue shopping/.test(html.slice(0, 20000))
  );
}

// Header sets to try in order. Amazon is pickier about browser-looking requests from a
// server than about plain ones, and shows a "Continue shopping" wall when it objects.
const PROFILES: Record<string, Record<string, string>> = {
  plain: { "user-agent": UA, accept: "*/*" },
  simple: { "user-agent": UA, accept: "text/html,application/xhtml+xml", "accept-language": "en-US,en;q=0.9" },
  browser: {
    "user-agent": UA,
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
    "upgrade-insecure-requests": "1",
  },
};

export async function fetchHtml(url: URL): Promise<{ status: number; html: string; finalUrl: URL }> {
  if (isPrivateHost(url.hostname)) throw new Error("Private network addresses can't be autofilled.");
  const order = /(^|\.)(amazon\.|amzn\.|a\.co$)/.test(url.hostname) ? ["plain", "simple", "browser"] : ["browser", "plain"];
  let last: { status: number; html: string; finalUrl: URL } | undefined;
  for (const [i, name] of order.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1200));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(url, { signal: ctrl.signal, redirect: "follow", cache: "no-store", headers: PROFILES[name] });
      const html = (await res.text()).slice(0, 4_000_000);
      last = { status: res.status, html, finalUrl: new URL(res.url || url.toString()) };
      if (!(isBotWall(html) || res.status === 403 || res.status === 503 || res.status === 429)) return last;
    } catch (e) {
      if (i === order.length - 1 && !last && !solverConfigured()) throw e;
    } finally {
      clearTimeout(timer);
    }
  }
  // Still walled: hand the page to a solver if one is set up.
  const solved = await viaSolver(url).catch(() => null);
  if (solved) return solved;
  if (!last) throw new Error("Couldn't reach that store.");
  return last;
}

// --- Bot-wall helpers (optional) ---
// FLARESOLVERR_URL: a FlareSolverr container (e.g. http://flaresolverr:8191) that loads the page
// in a real browser and returns the HTML. Works for Cloudflare-style challenges.
// SCRAPER_API_URL: any scraping API that takes the target URL, with {url} as the placeholder,
// e.g. https://api.scraperapi.com/?api_key=KEY&url={url}. Tried if FlareSolverr isn't set or fails.
function solverConfigured(): boolean {
  return !!(solverUrl() || scraperApiUrl());
}
function solverUrl(): string {
  return (getSetting("flaresolverr_url") || process.env.FLARESOLVERR_URL || "").replace(/\/$/, "");
}
function scraperApiUrl(): string {
  return getSetting("scraper_api_url") || process.env.SCRAPER_API_URL || "";
}

async function viaSolver(url: URL): Promise<{ status: number; html: string; finalUrl: URL } | null> {
  const fs = solverUrl();
  if (fs) {
    try {
      const res = await fetch(`${fs}/v1`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cmd: "request.get", url: url.toString(), maxTimeout: 60000 }),
        signal: AbortSignal.timeout(70000),
        cache: "no-store",
      });
      const data = (await res.json()) as { status?: string; solution?: { status?: number; response?: string; url?: string } };
      const html = data.solution?.response ?? "";
      if (data.status === "ok" && html && !isBotWall(html)) {
        return { status: data.solution?.status ?? 200, html: html.slice(0, 4_000_000), finalUrl: new URL(data.solution?.url || url.toString()) };
      }
    } catch {
      /* fall through to the scraping API */
    }
  }
  const api = scraperApiUrl();
  if (api.includes("{url}")) {
    const res = await fetch(api.replace("{url}", encodeURIComponent(url.toString())), { signal: AbortSignal.timeout(70000), cache: "no-store" });
    const html = (await res.text()).slice(0, 4_000_000);
    if (res.ok && !isBotWall(html)) return { status: res.status, html, finalUrl: url };
  }
  return null;
}

export async function fetchProduct(rawUrl: string): Promise<ProductInfo> {
  const parsed = normalizeUrl(rawUrl);
  if (!parsed) throw new Error("That doesn't look like a link.");
  if (isPrivateHost(parsed.hostname)) throw new Error("Private network addresses can't be autofilled.");
  let url = canonical(parsed);
  let store = storeFromHost(url.hostname);
  const base = (): ProductInfo => ({ store: store.name, url: parsed.toString() });

  let status = 0;
  let html = "";
  try {
    const r = await fetchHtml(url);
    status = r.status;
    html = r.html;
    // Short links (a.co, amzn.to) land on the real store; read it as that store.
    if (r.finalUrl.hostname !== url.hostname) {
      url = canonical(r.finalUrl);
      store = storeFromHost(url.hostname);
    }
  } catch (e) {
    if ((e as Error).message.startsWith("Private")) throw e;
    return { ...base(), title: titleFromPath(url), problem: "blocked", blocked: true };
  }

  if (isBotWall(html) || status === 403 || status === 429 || status === 503) {
    return { ...base(), title: titleFromPath(url), problem: "blocked", blocked: true };
  }
  if (status === 404 || status === 410 || MISSING.test(pageTitle(html))) {
    return { ...base(), title: titleFromPath(url), problem: "missing" };
  }
  const generic = parseGeneric(html);
  const specific = adapters[store.key]?.(html) ?? {};
  const merged: ProductInfo = { ...base(), ...stripEmpty(generic), ...stripEmpty(specific) };
  if (store.key === "amazon" && !merged.price_cents && /primary-availability-message[^>]*>\s*(Currently unavailable|Temporarily out of stock)|>\s*Currently unavailable\.\s*</i.test(html)) {
    merged.problem = "unavailable";
  }
  if (!merged.title) merged.title = titleFromPath(url);
  if (merged.title) merged.title = decodeEntities(merged.title).replace(/^Amazon\.com\s*:\s*/i, "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (merged.image_url) merged.image_url = new URL(merged.image_url, url).toString();
  if (merged.description) merged.description = decodeEntities(merged.description).replace(/^Amazon\.com\s*:\s*/i, "").replace(/\s*:\s*[A-Z][\w &,]+$/, "").trim();
  return merged;
}

function stripEmpty<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "")) as Partial<T>;
}

function titleFromPath(url: URL): string | undefined {
  const seg = url.pathname.split("/").filter(Boolean).find((s) => s.includes("-") && s.length > 8 && (s.match(/[a-z]/gi)?.length ?? 0) > s.length / 2);
  return seg ? decodeURIComponent(seg).replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : undefined;
}
