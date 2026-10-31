import "server-only";
import { all, get } from "./db";
import type { Family, Profile, User, WishList } from "./types";

export type ListWithOwner = WishList & {
  owner_user_id: number;
  profile_name: string;
  profile_avatar: string;
  profile_is_primary: number;
  item_count?: number;
};

const LIST_SELECT = `
  SELECT l.*, p.user_id AS owner_user_id, p.name AS profile_name, p.avatar AS profile_avatar,
         p.is_primary AS profile_is_primary,
         (SELECT COUNT(*) FROM items i WHERE i.list_id = l.id AND i.needs_approval = 0 AND i.archived_at IS NULL) AS item_count
  FROM lists l JOIN profiles p ON p.id = l.profile_id`;

// Visibility rule for a viewer who does not manage the list.
const VISIBLE_TO = `
  p.user_id != :uid
  AND NOT EXISTS (SELECT 1 FROM list_owners o WHERE o.list_id = l.id AND o.user_id = :uid)
  AND NOT EXISTS (SELECT 1 FROM list_hidden_users h WHERE h.list_id = l.id AND h.user_id = :uid)
  AND (
    (l.visibility = 'family' AND EXISTS (
      SELECT 1 FROM family_members a JOIN family_members b ON a.family_id = b.family_id
      WHERE a.user_id = p.user_id AND b.user_id = :uid))
    OR (l.visibility = 'custom' AND EXISTS (
      SELECT 1 FROM list_families lf JOIN family_members m ON m.family_id = lf.family_id
      WHERE lf.list_id = l.id AND m.user_id = :uid))
  )`;
const VIS_N = VISIBLE_TO.split(":uid").length - 1;
const visSql = VISIBLE_TO.replaceAll(":uid", "?");

export function myProfiles(userId: number): Profile[] {
  return all<Profile>("SELECT * FROM profiles WHERE user_id = ? ORDER BY is_primary DESC, name", userId);
}

// Lists the user manages: their own profiles' lists plus lists they co-own.
export function myLists(userId: number): ListWithOwner[] {
  return all<ListWithOwner>(
    `${LIST_SELECT} WHERE p.user_id = ? OR l.id IN (SELECT list_id FROM list_owners WHERE user_id = ?)
     ORDER BY p.user_id != ?, p.is_primary DESC, p.name, l.created_at DESC`,
    userId, userId, userId,
  );
}

export function sharedWithMe(userId: number): ListWithOwner[] {
  return all<ListWithOwner>(
    `${LIST_SELECT} WHERE ${visSql} ORDER BY p.name, l.created_at DESC`,
    ...Array(VIS_N).fill(userId),
  );
}

export function getList(listId: number): ListWithOwner | undefined {
  return get<ListWithOwner>(`${LIST_SELECT} WHERE l.id = ?`, listId);
}

export type ListAccess = "owner" | "viewer" | "none";

// Managers are the profile's owner plus any co-owners added to the list.
export function isManager(userId: number, list: ListWithOwner): boolean {
  return list.owner_user_id === userId || !!get("SELECT 1 FROM list_owners WHERE list_id = ? AND user_id = ?", list.id, userId);
}

export function listManagers(list: ListWithOwner): number[] {
  const extra = all<{ user_id: number }>("SELECT user_id FROM list_owners WHERE list_id = ?", list.id).map((r) => r.user_id);
  return [list.owner_user_id, ...extra.filter((id) => id !== list.owner_user_id)];
}

export function listAccess(user: User, list: ListWithOwner): ListAccess {
  if (isManager(user.id, list)) return "owner";
  const ok = get(
    `SELECT 1 FROM lists l JOIN profiles p ON p.id = l.profile_id WHERE l.id = ? AND ${visSql}`,
    list.id,
    ...Array(VIS_N).fill(user.id),
  );
  return ok ? "viewer" : "none";
}

// Only the person a list is for is kept in the dark about claims and purchases.
// Parents managing a kid profile, and co-owners, see everything so they can coordinate.
export function isRecipient(userId: number, list: ListWithOwner): boolean {
  return !!list.profile_is_primary && list.owner_user_id === userId;
}

export function myFamilies(userId: number): (Family & { role: string })[] {
  return all<Family & { role: string }>(
    "SELECT f.*, m.role FROM families f JOIN family_members m ON m.family_id = f.id WHERE m.user_id = ? ORDER BY f.name",
    userId,
  );
}

// Families a user can share a list with: their own plus any connected families.
export function shareableFamilies(userId: number): (Family & { connected: number })[] {
  return all<Family & { connected: number }>(
    `SELECT f.*, 0 AS connected FROM families f JOIN family_members m ON m.family_id = f.id WHERE m.user_id = ?
     UNION
     SELECT f.*, 1 AS connected FROM families f
       JOIN family_links fl ON (fl.family_b = f.id OR fl.family_a = f.id)
       JOIN family_members m ON m.family_id = (CASE WHEN fl.family_a = f.id THEN fl.family_b ELSE fl.family_a END)
     WHERE m.user_id = ? AND f.id NOT IN (SELECT family_id FROM family_members WHERE user_id = ?)
     ORDER BY connected, name`,
    userId,
    userId,
    userId,
  );
}

// People who can currently see lists in the owner's families (for "hide from" and co-owner pickers).
export function familyPeople(userId: number): Pick<User, "id" | "name" | "avatar">[] {
  return all<Pick<User, "id" | "name" | "avatar">>(
    `SELECT DISTINCT u.id, u.name, u.avatar FROM users u
     JOIN family_members b ON b.user_id = u.id
     WHERE b.family_id IN (
       SELECT family_id FROM family_members WHERE user_id = ?
       UNION
       SELECT CASE WHEN fl.family_a = m.family_id THEN fl.family_b ELSE fl.family_a END
       FROM family_links fl JOIN family_members m ON m.family_id IN (fl.family_a, fl.family_b) WHERE m.user_id = ?
     ) AND u.id != ? ORDER BY u.name`,
    userId,
    userId,
    userId,
  );
}

export type FamilyProfile = Profile & { owner_name: string };

// Profiles belonging to other people in the user's families (their own and their kids').
export function familyProfiles(userId: number): FamilyProfile[] {
  const ids = familyPeople(userId).map((p) => p.id);
  if (!ids.length) return [];
  return all<FamilyProfile>(
    `SELECT p.*, u.name AS owner_name FROM profiles p JOIN users u ON u.id = p.user_id
     WHERE p.user_id IN (${ids.map(() => "?").join(",")}) ORDER BY p.is_primary DESC, u.name, p.name`,
    ...ids,
  );
}

// A kid profile can be edited by the parent who made it and by anyone in the same family.
// Grown-ups' own profiles stay theirs alone.
export function canEditProfile(userId: number, profile: Profile): boolean {
  if (profile.user_id === userId) return true;
  if (profile.is_primary) return false;
  return familyPeople(userId).some((p) => p.id === profile.user_id);
}
