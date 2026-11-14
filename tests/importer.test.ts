import { describe, expect, it } from "vitest";
import { amazonListUrl, parseAmazonList, parseCsv, toCsv, wishesFromCsv, EXPORT_COLUMNS } from "@/lib/importer";

describe("Amazon wish lists", () => {
  it("recognizes list links in their different shapes", () => {
    expect(amazonListUrl("https://www.amazon.com/hz/wishlist/ls/2ABCDEF1234XY?ref_=wl_share")?.toString())
      .toBe("https://www.amazon.com/hz/wishlist/ls/2ABCDEF1234XY?viewType=list");
    expect(amazonListUrl("https://www.amazon.co.uk/gp/registry/wishlist/3ZZZZZZZZZZZ")?.hostname).toBe("www.amazon.co.uk");
    expect(amazonListUrl("https://www.amazon.com/dp/B000000001")).toBeNull();
    expect(amazonListUrl("https://evil.example/hz/wishlist/ls/2ABCDEF1234XY")).toBeNull();
    expect(amazonListUrl("not a link")).toBeNull();
  });

  it("reads items and the next page", () => {
    const base = new URL("https://www.amazon.com/hz/wishlist/ls/2ABCDEF1234XY?viewType=list");
    const html = `
      <ul>
      <li data-id="2ABC" data-itemId="I1" data-price="24.99" class="g-item-sortable">
        <img alt="LEGO" src="https://m.media-amazon.com/images/I/lego.jpg">
        <a id="itemName_I1" title="LEGO Space Shuttle &amp; Rocket" href="/dp/B0TESTLEGO/?coliid=I1&amp;ref_=x">LEGO Space Shuttle</a>
        <span id="itemRequested_I1">2</span>
        <span id="itemComment_I1">The blue one</span>
      </li>
      <li data-id="2ABC" data-itemId="I2" data-price="-Infinity">
        <a id="itemName_I2" href="/dp/B0TESTBOOK">Unavailable Book</a>
      </li>
      </ul>
      <input type="hidden" name="showMoreUrl" value="/hz/wishlist/slv/items?filter=unpurchased&amp;paginationToken=abc">`;
    const r = parseAmazonList(html, base);
    expect(r.wishes).toHaveLength(2);
    expect(r.wishes[0]).toMatchObject({
      title: "LEGO Space Shuttle & Rocket", url: "https://www.amazon.com/dp/B0TESTLEGO", price_cents: 2499,
      image_url: "https://m.media-amazon.com/images/I/lego.jpg", quantity: 2, notes: "The blue one",
    });
    expect(r.wishes[1]).toMatchObject({ title: "Unavailable Book", price_cents: null });
    expect(r.next?.toString()).toBe("https://www.amazon.com/hz/wishlist/slv/items?filter=unpurchased&paginationToken=abc");
  });
});

describe("spreadsheets", () => {
  it("parses quotes, commas, new lines and semicolons", () => {
    expect(parseCsv('a,b\n"x, y","say ""hi"""\r\n')).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
    expect(parseCsv("Name;Price\nKite;12,50\n")).toEqual([["Name", "Price"], ["Kite", "12,50"]]);
  });

  it("maps common column names", () => {
    const w = wishesFromCsv("Name,Link,Price,Notes,Qty\nKite,https://shop.example/kite,$12.50,Red please,2\n,,,\n");
    expect(w).toEqual([expect.objectContaining({ title: "Kite", url: "https://shop.example/kite", price_cents: 1250, notes: "Red please", quantity: 2 })]);
    expect(wishesFromCsv("Name;Price\nKite;12,50")[0].price_cents).toBe(1250);
  });

  it("treats a sheet without headers as a list of names", () => {
    expect(wishesFromCsv("Bike\nScooter").map((w) => w.title)).toEqual(["Bike", "Scooter"]);
  });

  it("drops links that aren't web addresses", () => {
    expect(wishesFromCsv("name,url\nX,javascript:alert(1)")[0].url).toBe("");
  });

  it("round-trips an export, and defuses spreadsheet formulas", () => {
    const row = Object.fromEntries(EXPORT_COLUMNS.map((c) => [c, ""])) as Record<(typeof EXPORT_COLUMNS)[number], unknown>;
    const csv = toCsv([{ ...row, title: "=HYPERLINK(1)", price: "9.99", notes: "a, b" }]);
    expect(csv).toContain("'=HYPERLINK(1)");
    const back = wishesFromCsv(csv);
    expect(back[0]).toMatchObject({ title: "'=HYPERLINK(1)", price_cents: 999, notes: "a, b" });
  });
});
