// Shipping tracking numbers: spot the carrier and link to its tracking page.

export type Carrier = "UPS" | "USPS" | "FedEx" | "DHL" | "Amazon";

const PATTERNS: [Carrier, RegExp][] = [
  ["UPS", /^1Z[0-9A-Z]{16}$/],
  ["Amazon", /^TBA\d{12}$/],
  ["USPS", /^(9[2-5]\d{20}|\d{20}|[A-Z]{2}\d{9}US)$/],
  ["FedEx", /^(\d{12}|\d{15})$/],
  ["DHL", /^\d{10}$/],
];

export function cleanTracking(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, "").slice(0, 40);
}

export function detectCarrier(raw: string): Carrier | "" {
  const n = cleanTracking(raw);
  return PATTERNS.find(([, re]) => re.test(n))?.[0] ?? "";
}

export function trackingUrl(raw: string, carrier: string = detectCarrier(raw)): string {
  const n = encodeURIComponent(cleanTracking(raw));
  if (!n) return "";
  switch (carrier) {
    case "UPS": return `https://www.ups.com/track?tracknum=${n}`;
    case "USPS": return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`;
    case "FedEx": return `https://www.fedex.com/fedextrack/?trknbr=${n}`;
    case "DHL": return `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${n}`;
    case "Amazon": return `https://track.amazon.com/tracking/${n}`;
    default: return "";
  }
}

// Tracking is for the buyer and the list's managers (never the list's own person, and not
// other shoppers): it's on the purchase, which only those people should act on.
export function canSeeTracking(p: { buyer_user_id: number | null }, userId: number, managerNotRecipient: boolean): boolean {
  return p.buyer_user_id === userId || managerNotRecipient;
}
