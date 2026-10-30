export function formatMoney(cents: number | null | undefined, currency = "USD"): string {
  if (cents === null || cents === undefined) return "";
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

export function parseMoney(v: FormDataEntryValue | null): number | null {
  if (v === null) return null;
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ""));
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
