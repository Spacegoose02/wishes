// The household's money and date style, set by an admin in Settings → Server. Kept on
// globalThis so every module (and background job) in the server process shares it.
export type Region = { currency: string; locale: string };
export const DEFAULT_REGION: Region = { currency: "USD", locale: "en-US" };

const g = globalThis as unknown as { __wishesRegion?: Region };
export function region(): Region {
  return g.__wishesRegion ?? DEFAULT_REGION;
}
export function setRegion(r: Partial<Region>) {
  const next = { ...region(), ...Object.fromEntries(Object.entries(r).filter(([, v]) => v)) } as Region;
  try {
    new Intl.NumberFormat(next.locale, { style: "currency", currency: next.currency });
  } catch {
    return;
  }
  g.__wishesRegion = next;
}

export function formatMoney(cents: number | null | undefined, currency = region().currency): string {
  if (cents === null || cents === undefined) return "";
  try {
    return new Intl.NumberFormat(region().locale, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

export function currencySymbol(): string {
  try {
    return new Intl.NumberFormat(region().locale, { style: "currency", currency: region().currency, currencyDisplay: "narrowSymbol" })
      .formatToParts(0).find((p) => p.type === "currency")?.value ?? "$";
  } catch {
    return "$";
  }
}

// A day ("2026-12-25"), a unix time in seconds, or a Date, in the household's style.
export function formatDate(v: string | number | Date, withTime = false): string {
  const d = typeof v === "string" ? new Date(v.length === 10 ? v + "T00:00:00" : v) : typeof v === "number" ? new Date(v * 1000) : v;
  if (isNaN(d.getTime())) return "";
  const opts: Intl.DateTimeFormatOptions = withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" };
  try {
    return d.toLocaleString(region().locale, opts);
  } catch {
    return d.toLocaleString("en-US", opts);
  }
}

function decimalMark(): string {
  try {
    return new Intl.NumberFormat(region().locale).formatToParts(1.5).find((p) => p.type === "decimal")?.value ?? ".";
  } catch {
    return ".";
  }
}

const count = (s: string, c: string) => s.split(c).length - 1;

// Reads typed amounts in either style: "1,299.99", "1.299,99", "12,50", "$24.50", "€ 8".
export function parseMoney(v: FormDataEntryValue | null): number | null {
  if (v === null) return null;
  const s = String(v).replace(/[^0-9.,]/g, "");
  if (!/[0-9]/.test(s)) return null;
  const comma = s.lastIndexOf(",");
  const dot = s.lastIndexOf(".");
  let normalized = s;
  if (comma >= 0 && dot >= 0) {
    // Whichever comes last is the decimal mark.
    normalized = comma > dot ? s.split(".").join("").replace(",", ".") : s.split(",").join("");
  } else if (comma >= 0) {
    normalized = count(s, ",") === 1 && /,[0-9]{1,2}$/.test(s) ? s.replace(",", ".") : s.split(",").join("");
  } else if (dot >= 0 && (count(s, ".") > 1 || (/\.[0-9]{3}$/.test(s) && decimalMark() === ","))) {
    normalized = s.split(".").join("");
  }
  const n = parseFloat(normalized);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
}

export function ageFrom(birthday: string | null): number | undefined {
  if (!birthday) return undefined;
  const b = new Date(birthday);
  if (isNaN(b.getTime())) return undefined;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) age--;
  return age >= 0 ? age : undefined;
}

export function daysUntil(date: string | null, now = Date.now()): number | undefined {
  if (!date) return undefined;
  const d = new Date(date + "T00:00:00");
  if (isNaN(d.getTime())) return undefined;
  return Math.ceil((d.getTime() - now) / 86400000);
}
