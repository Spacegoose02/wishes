import { describe, expect, it } from "vitest";
import { decodeEntities, parseJsonLd, toCents } from "@/lib/scrape/generic";
import { formatMoney, parseMoney } from "@/lib/format";
import { guessCategory } from "@/lib/categories";

describe("toCents", () => {
  it.each([
    ["29.99", 2999],
    ["$1,299.99", 129999],
    ["1.299,99", 129999],
    [15, 1500],
    ["", undefined],
    ["0", undefined],
    [null, undefined],
  ])("%s -> %s", (input, cents) => expect(toCents(input)).toBe(cents));
});

describe("parseMoney", () => {
  it("reads typed prices", () => {
    expect(parseMoney("$24.50")).toBe(2450);
    expect(parseMoney("abc")).toBeNull();
    expect(parseMoney(null)).toBeNull();
  });
  it("formats cents", () => expect(formatMoney(129999)).toBe("$1,299.99"));
});

describe("parseJsonLd", () => {
  it("finds a product inside @graph with offer pricing", () => {
    const html = `<script type="application/ld+json">${JSON.stringify({
      "@graph": [{ "@type": "WebPage" }, { "@type": "Product", name: "LEGO Bonsai", image: ["https://x/img.jpg"], offers: { price: "49.99", priceCurrency: "USD" } }],
    })}</script>`;
    expect(parseJsonLd(html)).toMatchObject({ title: "LEGO Bonsai", price_cents: 4999, image_url: "https://x/img.jpg" });
  });

  it("ignores broken JSON", () => {
    expect(parseJsonLd(`<script type="application/ld+json">{oops</script>`)).toEqual({});
  });
});

describe("decodeEntities", () => {
  it("decodes named and numeric entities", () => expect(decodeEntities("Tom &amp; Jerry&#39;s &#x2764;")).toBe("Tom & Jerry's ❤"));
});

describe("guessCategory", () => {
  it("spots obvious categories", () => {
    expect(guessCategory("LEGO Botanicals Bonsai Tree", "LEGO")).toBe("toys");
  });
});
