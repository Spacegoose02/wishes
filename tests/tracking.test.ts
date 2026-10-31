import { describe, expect, it } from "vitest";
import { canSeeTracking, cleanTracking, detectCarrier, trackingUrl } from "@/lib/tracking";

describe("tracking numbers", () => {
  it.each([
    ["1Z999AA10123456784", "UPS"],
    ["1z 999 aa1 0123456784", "UPS"],
    ["9400 1000 0000 0000 0000 00", "USPS"],
    ["EA123456789US", "USPS"],
    ["123456789012", "FedEx"],
    ["TBA123456789012", "Amazon"],
    ["1234567890", "DHL"],
    ["hello", ""],
  ])("%s is %s", (n, carrier) => expect(detectCarrier(n)).toBe(carrier));

  it("links to the carrier's tracking page", () => {
    expect(trackingUrl("1Z999AA10123456784")).toBe("https://www.ups.com/track?tracknum=1Z999AA10123456784");
    expect(trackingUrl("whatever")).toBe("");
    expect(cleanTracking(" ab-12 cd ")).toBe("AB12CD");
  });

  it("is only for the buyer and the list's managers", () => {
    expect(canSeeTracking({ buyer_user_id: 5 }, 5, false)).toBe(true);
    expect(canSeeTracking({ buyer_user_id: 5 }, 6, true)).toBe(true);
    expect(canSeeTracking({ buyer_user_id: 5 }, 6, false)).toBe(false);
    expect(canSeeTracking({ buyer_user_id: null }, 6, false)).toBe(false);
  });
});
