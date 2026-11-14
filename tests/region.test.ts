import { describe, expect, it } from "vitest";
import * as f from "@/lib/format";

describe("money in other styles", () => {
  it("reads decimal commas and thousands dots", () => {
    expect(f.parseMoney("12,50")).toBe(1250);
    expect(f.parseMoney("1.299,99 €")).toBe(129999);
    expect(f.parseMoney("1,299.99")).toBe(129999);
    expect(f.parseMoney("1,299")).toBe(129900);
    expect(f.parseMoney("1.234.567")).toBe(123456700);
    expect(f.parseMoney("12.5")).toBe(1250);
    expect(f.parseMoney("$24.50")).toBe(2450);
  });

  it("formats in the household's currency and style", () => {
    f.setRegion({ currency: "EUR", locale: "de-DE" });
    expect(f.formatMoney(129999)).toMatch(/1\.299,99\s?€/);
    expect(f.parseMoney("1.234")).toBe(123400);
    expect(f.currencySymbol()).toBe("€");
    expect(f.formatDate("2026-12-25")).toContain("2026");
    f.setRegion({ currency: "NOPE" });
    expect(f.region().currency).toBe("EUR");
    f.setRegion(f.DEFAULT_REGION);
    expect(f.formatMoney(129999)).toBe("$1,299.99");
  });
});
