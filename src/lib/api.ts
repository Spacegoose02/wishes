import "server-only";
import { all, get } from "./db";
import { familyProfiles, getList, listManagers, myProfiles, type ListWithOwner } from "./access";
import { insertItem } from "./wishes";
import { notify } from "./notify";
import { announceWishes } from "./fresh";
import { normalizeUrl } from "./scrape";
import { storeFromHost } from "./scrape/stores";
import { guessCategory, validCategory } from "./categories";
import { validKind } from "./kinds";
import type { Item, Profile, User } from "./types";

// The /api/v1 endpoints other apps call with an API key (see apitokens.ts and docs/api.md).
// Everything here acts as the key's owner and goes through the same access rules as the app.

export type ApiResult = { status: number; body: Record<string, unknown> };

const fail = (status: number, error: string, extra: Record<string, unknown> = {}): ApiResult => ({ status, body: { error, ...extra } });

type ApiList = { list_id: number; title: string; emoji: string; occasion: string; event_date: string | null };
export type ApiKid = { profile_id: number; name: string; avatar: string; is_kid: boolean; default_list_id: number | null; lists: ApiList[] };

// Upcoming dated lists first (soonest first), then undated ones, then past ones; newest first within each.
const LIST_ORDER = "(event_date IS NOT NULL AND event_date >= date('now')) DESC, event_date, created_at DESC, id DESC";

function listsOf(profileId: number): ApiList[] {
  return all<ApiList>(
    `SELECT id AS list_id, title, emoji, occasion, event_date FROM lists WHERE profile_id = ? ORDER BY ${LIST_ORDER}`,
    profileId,
  );
}

// Profiles the key's owner can add wishes for: their own, their kids, and kids in their families.
// Stand-in profiles for other grown-ups (secret idea lists) are left out.
export function apiProfiles(user: User): Profile[] {
  const mine = myProfiles(user.id).filter((p) => !p.linked_user_id);
  const kin = familyProfiles(user.id).filter((p) => !p.is_primary && !p.linked_user_id);
  const seen = new Set<number>();
  return [...mine, ...kin].filter((p) => !seen.has(p.id) && seen.add(p.id));
}

export function apiKids(user: User): ApiKid[] {
  return apiProfiles(user).map((p) => {
    const lists = listsOf(p.id);
    return { profile_id: p.id, name: p.name, avatar: p.avatar, is_kid: !p.is_primary, default_list_id: lists[0]?.list_id ?? null, lists };
  });
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const int = (v: unknown, lo: number, hi: number, dflt: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : dflt;

// Which list a new wish goes on: an exact list_id, or a profile (by id, or by name) and that profile's default list.
function target(user: User, body: Record<string, unknown>): { list: ListWithOwner } | ApiResult {
  if (body.list_id !== undefined) {
    const list = typeof body.list_id === "number" ? getList(body.list_id) : undefined;
    if (!list || !apiProfiles(user).some((p) => p.id === list.profile_id)) {
      return fail(404, "No list with that list_id that this key can add to.");
    }
    return { list };
  }
  const profiles = apiProfiles(user);
  let profile: Profile | undefined;
  if (body.profile_id !== undefined) {
    profile = profiles.find((p) => p.id === body.profile_id);
    if (!profile) return fail(404, "No profile with that profile_id that this key can add to.");
  } else if (typeof body.kid === "string" && body.kid.trim()) {
    const name = body.kid.trim().toLowerCase();
    const matches = profiles.filter((p) => p.name.trim().toLowerCase() === name);
    if (!matches.length) return fail(404, `Nobody called "${body.kid.trim()}" here. GET /api/v1/kids lists the names.`);
    if (matches.length > 1) {
      return fail(409, `More than one "${body.kid.trim()}". Send profile_id instead.`, { profile_ids: matches.map((p) => p.id) });
    }
    profile = matches[0];
  } else {
    return fail(400, "Say whose list it goes on: list_id, profile_id, or kid (a name).");
  }
  const first = listsOf(profile.id)[0];
  const list = first && getList(first.list_id);
  if (!list) return fail(409, `${profile.name} doesn't have a list yet. Make one in Wishes first.`);
  return { list };
}

function wishOut(item: Item, list: ListWithOwner, origin: string) {
  return {
    id: item.id,
    title: item.title,
    list_id: list.id,
    list_title: list.title,
    profile_id: list.profile_id,
    profile_name: list.profile_name,
    needs_approval: !!item.needs_approval,
    link: `${origin}/lists/${list.id}#item-${item.id}`,
  };
}

// POST /api/v1/wishes. A wish arrives waiting for a grown-up's OK (like kid mode) unless the
// caller says it was already approved. Sending the same title again returns the wish already there.
export function apiAddWish(user: User, appName: string, body: unknown, origin: string): ApiResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail(400, "Send a JSON object.");
  const b = body as Record<string, unknown>;
  const title = str(b.title, 200);
  if (!title) return fail(400, "Every wish needs a title.");
  const t = target(user, b);
  if (!("list" in t)) return t;
  const { list } = t;

  const same = get<Item>(
    "SELECT * FROM items WHERE list_id = ? AND archived_at IS NULL AND surprise = 0 AND lower(trim(title)) = lower(?) ORDER BY id DESC LIMIT 1",
    list.id, title,
  );
  if (same) return { status: 200, body: { duplicate: true, wish: wishOut(same, list, origin) } };

  const rawUrl = str(b.url, 2000);
  const url = rawUrl ? normalizeUrl(rawUrl)?.toString() ?? "" : "";
  const store = str(b.store, 80) || (url ? storeFromHost(new URL(url).hostname).name : "");
  const kind = validKind(str(b.kind, 20));
  const image = str(b.image_url, 2000);
  const price = typeof b.price_cents === "number" && Number.isInteger(b.price_cents) && b.price_cents > 0 && b.price_cents < 100_000_000 ? b.price_cents : null;
  const approved = b.approved === true;

  const id = insertItem(list.id, {
    kind,
    title,
    url,
    store,
    price,
    image_url: /^https:\/\//.test(image) ? image : "",
    notes: str(b.notes, 1000),
    priority: int(b.priority, 1, 3, 2),
    quantity: int(b.quantity, 1, 99, 1),
    category: validCategory(str(b.category, 40)) || (kind === "product" ? guessCategory(title, store) : "experiences"),
    variant: str(b.variant, 100),
    color: str(b.color, 60),
    size: str(b.size, 60),
  }, appName, !approved, { addedBy: user.id });

  if (approved) {
    announceWishes(list, 1, user.id);
  } else {
    for (const uid of listManagers(list)) {
      notify(uid, "approval", `${list.profile_name} wished for ${title} (from ${appName}). Approve it so shoppers can see it.`, `/lists/${list.id}#item-${id}`);
    }
  }
  const item = get<Item>("SELECT * FROM items WHERE id = ?", id)!;
  return { status: 201, body: { duplicate: false, wish: wishOut(item, list, origin) } };
}
