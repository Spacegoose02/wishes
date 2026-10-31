import { ageFrom } from "./format";
import type { Profile } from "./types";

// Sizes people actually get asked about when someone shops for them.
export const SIZE_FIELDS = [
  { id: "shirt", label: "Shirt / top", placeholder: "Kids M (8), Adult L" },
  { id: "pants", label: "Pants", placeholder: "10 slim, 32x30" },
  { id: "dress", label: "Dress", placeholder: "7" },
  { id: "shoes", label: "Shoes", placeholder: "Youth 2, Women 8.5" },
  { id: "pajamas", label: "Pajamas", placeholder: "8" },
  { id: "hat", label: "Hat / gloves", placeholder: "Youth" },
  { id: "ring", label: "Ring", placeholder: "6" },
  { id: "other", label: "Other", placeholder: "Bike: 20 in" },
] as const;

export type Sizes = Partial<Record<(typeof SIZE_FIELDS)[number]["id"], string>>;

export function parseSizes(raw: string | null | undefined): Sizes {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

export function sizesFromForm(form: FormData): string {
  const out: Sizes = {};
  for (const f of SIZE_FIELDS) {
    const v = String(form.get(`size_${f.id}`) ?? "").trim().slice(0, 40);
    if (v) out[f.id] = v;
  }
  return JSON.stringify(out);
}

// Birthday wins (it stays right as they grow); the typed age is the fallback.
export function profileAge(p: Pick<Profile, "birthday" | "age">): number | undefined {
  return ageFrom(p.birthday) ?? (p.age ?? undefined);
}

export function sizeSummary(p: Pick<Profile, "sizes">): string {
  const sizes = parseSizes(p.sizes);
  return SIZE_FIELDS.filter((f) => sizes[f.id]).map((f) => `${f.label.split(" /")[0]} ${sizes[f.id]}`).join(" · ");
}

// Plain-text profile for AI prompts.
export function describeProfile(p: Profile): string {
  const age = profileAge(p);
  return [
    `Name: ${p.name}`,
    age !== undefined ? `Age: ${age}` : "",
    p.likes ? `Loves / interested in: ${p.likes}` : "",
    p.dislikes ? `Doesn't like / avoid: ${p.dislikes}` : "",
    sizeSummary(p) ? `Sizes: ${sizeSummary(p)}` : "",
    p.gift_notes ? `Notes from family: ${p.gift_notes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

// Kids grow: sizes older than about six months deserve a quick check.
export const SIZE_CHECK_DAYS = 182;

export function sizesStale(p: Pick<Profile, "sizes" | "sizes_updated_at">, now = Date.now()): boolean {
  if (!Object.values(parseSizes(p.sizes)).some(Boolean)) return false;
  return !p.sizes_updated_at || now / 1000 - p.sizes_updated_at > SIZE_CHECK_DAYS * 86400;
}

export function monthsAgo(ts: number | null, now = Date.now()): number {
  return ts ? Math.max(0, Math.floor((now / 1000 - ts) / (30.44 * 86400))) : 0;
}
