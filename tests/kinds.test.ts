import { describe, expect, it } from "vitest";
import { isFund, kindInfo, validKind } from "@/lib/kinds";

describe("wish kinds", () => {
  it("falls back to a product for anything unknown", () => {
    expect(validKind("fund")).toBe("fund");
    expect(validKind("gift_card")).toBe("gift_card");
    expect(validKind("pony")).toBe("product");
    expect(kindInfo("nope").id).toBe("product");
  });
  it("labels the price by kind", () => {
    expect(kindInfo("fund").price).toBe("Goal");
    expect(kindInfo("gift_card").price).toBe("Amount");
  });
  it("only funds are pledge-only", () => {
    expect(isFund("fund")).toBe(true);
    expect(isFund("experience")).toBe(false);
  });
});
