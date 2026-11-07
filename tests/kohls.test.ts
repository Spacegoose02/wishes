import { describe, expect, it } from "vitest";
import { adapters } from "@/lib/scrape/stores";

describe("kohls adapter", () => {
  it("reads the old JSON price", () => {
    expect(adapters.kohls!('"salePrice": {"minPrice": 12.5, "maxPrice": null}').price_cents).toBe(1250);
  });
  it("reads entity-encoded island props", () => {
    const html =
      '&quot;regularPrice&quot;:[0,{&quot;minPrice&quot;:[0,11.99],&quot;maxPrice&quot;:[0,null]}],' +
      '&quot;salePrice&quot;:[0,{&quot;minPrice&quot;:[0,5.99],&quot;maxPrice&quot;:[0,null]}]';
    expect(adapters.kohls!(html).price_cents).toBe(599);
  });
  it("falls back to the regular price", () => {
    expect(adapters.kohls!('&quot;regularPrice&quot;:[0,{&quot;minPrice&quot;:[0,11.99]}]').price_cents).toBe(1199);
  });
});
