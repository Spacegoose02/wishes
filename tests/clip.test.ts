import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ getSetting: () => undefined }));

import { bookmarkletCode, clipDefaults, clipParams, forwardClip } from "@/lib/clip";
import { parseProduct } from "@/lib/scrape";

const sp = (p: URLSearchParams) => Object.fromEntries(p.entries());

describe("clip params", () => {
  it("round-trips through /share to the add form", () => {
    const p = clipParams({ url: "https://www.kohls.com/product/prd-1.jsp", title: "  Bath   Towel ", price_cents: 599, image_url: "https://media.kohlsimg.com/x", store: "Kohl's", category: "home" });
    expect(p.get("url")).toBe("https://www.kohls.com/product/prd-1.jsp");
    const forwarded = new URLSearchParams(`add=x${forwardClip(sp(p))}`);
    expect(clipDefaults(sp(forwarded))).toMatchObject({ title: "Bath Towel", price: "5.99", image_url: "https://media.kohlsimg.com/x", store: "Kohl's", category: "home" });
  });
  it("ignores anything that isn't a clip, and drops unsafe values", () => {
    expect(forwardClip({ name: "x" })).toBe("");
    expect(clipDefaults({ name: "x" })).toBeNull();
    expect(clipDefaults({ clip: "1", image: "javascript:alert(1)", price: "lots" })).toMatchObject({ image_url: undefined, price: undefined });
  });
});

describe("bookmarklet", () => {
  it("is valid JavaScript that only talks to the Wishes address", () => {
    const code = bookmarkletCode("https://wishes.example.com/");
    expect(code.startsWith("javascript:")).toBe(true);
    const js = decodeURIComponent(code.slice("javascript:".length));
    expect(() => new Function(js)).not.toThrow();
    expect(js).toContain('"https://wishes.example.com"');
    expect(js).toContain('w.postMessage({type:"wishes-clip"');
  });
});

describe("parseProduct", () => {
  it("reads a page the browser already loaded, without a bot-wall check", () => {
    const html =
      '<html><head><title>Towel | Kohl\'s</title><meta property="og:title" content="Sonoma Bath Towel">' +
      '<meta property="og:image" content="https://media.kohlsimg.com/is/image/kohls/4569319"><script src="/px-captcha.js"></script></head>' +
      '<body><astro-island props="{&quot;salePrice&quot;:[0,{&quot;minPrice&quot;:[0,5.99]}]}"></astro-island></body></html>';
    const info = parseProduct("https://www.kohls.com/product/prd-4569319/sonoma-towel.jsp", html);
    expect(info).toMatchObject({ store: "Kohl's", title: "Sonoma Bath Towel", price_cents: 599, image_url: "https://media.kohlsimg.com/is/image/kohls/4569319" });
    expect(info.blocked).toBeUndefined();
  });
});
