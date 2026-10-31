"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { get, run, tx } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { familyPeople, isManager, shareableFamilies } from "@/lib/access";
import { copyList, profileById, viewToken } from "@/lib/lists";
import type { Profile } from "@/lib/types";
import { rollAvatar as roll } from "@/components/Avatar";
import { s, n, ownList, setHiddenUsers, viewList } from "./_shared";

// "Who is it for?" can be: one of my profiles (p:ID), any profile in my families (p:ID),
// a family member (u:ID, optionally kept secret from them), or a brand-new name.
export async function createList(form: FormData) {
  const user = await requireUser();
  const title = s(form, "title");
  if (!title) redirect("/lists/new?error=Give+your+list+a+name");
  const target = s(form, "for");
  const newName = s(form, "new_name").slice(0, 60);
  const secret = !!form.get("secret");
  const people = familyPeople(user.id);
  const vis = ["private", "family"].includes(s(form, "visibility")) ? s(form, "visibility") : "family";

  const id = tx(() => {
    let profile: Profile | undefined;
    let hideFrom: number[] = form.getAll("hidden").map(Number);
    if (newName || target === "new") {
      if (!newName) return 0;
      const r = run("INSERT INTO profiles (user_id, name, avatar) VALUES (?, ?, ?)", user.id, newName, roll());
      profile = get<Profile>("SELECT * FROM profiles WHERE id = ?", Number(r.lastInsertRowid));
    } else if (target.startsWith("u:")) {
      const other = people.find((p) => p.id === Number(target.slice(2)));
      if (!other) return 0;
      if (secret) {
        // A profile I manage that stands for them, so the list stays out of their view.
        profile = get<Profile>("SELECT * FROM profiles WHERE user_id = ? AND linked_user_id = ?", user.id, other.id);
        if (!profile) {
          const r = run("INSERT INTO profiles (user_id, name, avatar, linked_user_id) VALUES (?, ?, ?, ?)", user.id, other.name, other.avatar, other.id);
          profile = get<Profile>("SELECT * FROM profiles WHERE id = ?", Number(r.lastInsertRowid));
        }
        hideFrom = [...hideFrom, other.id];
      } else {
        profile = get<Profile>("SELECT * FROM profiles WHERE user_id = ? AND is_primary = 1", other.id);
      }
    } else if (target.startsWith("p:")) {
      const p = get<Profile>("SELECT * FROM profiles WHERE id = ?", Number(target.slice(2)));
      if (p && (p.user_id === user.id || people.some((x) => x.id === p.user_id))) profile = p;
    }
    if (!profile) return 0;
    const r = run(
      "INSERT INTO lists (profile_id, title, description, emoji, occasion, event_date, visibility, yearly) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      profile.id, title, s(form, "description"), s(form, "emoji") || "🎁", s(form, "occasion"), s(form, "event_date") || null, vis, form.get("yearly") ? 1 : 0,
    );
    const listId = Number(r.lastInsertRowid);
    // Making a list for someone else's profile makes you a co-owner of it.
    if (profile.user_id !== user.id) run("INSERT OR IGNORE INTO list_owners (list_id, user_id) VALUES (?, ?)", listId, user.id);
    setHiddenUsers(listId, user.id, hideFrom);
    return listId;
  });
  if (!id) redirect("/lists/new?error=" + encodeURIComponent("Pick who the list is for, or type a name"));
  redirect(`/lists/${id}`);
}

export async function updateList(form: FormData) {
  const { user, list } = await ownList(n(form, "list_id"));
  const vis = ["private", "family", "custom"].includes(s(form, "visibility")) ? s(form, "visibility") : "family";
  const allowedFamilies = new Set(shareableFamilies(list.owner_user_id).map((f) => f.id));
  const profileId = n(form, "profile_id");
  const profileOk = get("SELECT 1 FROM profiles WHERE id = ? AND user_id = ?", profileId, list.owner_user_id);
  const people = new Set(familyPeople(list.owner_user_id).map((p) => p.id));
  tx(() => {
    run(
      "UPDATE lists SET title = ?, description = ?, emoji = ?, occasion = ?, event_date = ?, visibility = ?, profile_id = ?, review_purchases = ?, yearly = ? WHERE id = ?",
      s(form, "title") || list.title, s(form, "description"), s(form, "emoji") || "🎁", s(form, "occasion"),
      s(form, "event_date") || null, vis, profileOk ? profileId : list.profile_id, form.get("review_purchases") ? 1 : 0, form.get("yearly") ? 1 : 0, list.id,
    );
    run("DELETE FROM list_families WHERE list_id = ?", list.id);
    for (const fid of form.getAll("families").map(Number)) {
      if (allowedFamilies.has(fid)) run("INSERT OR IGNORE INTO list_families (list_id, family_id) VALUES (?, ?)", list.id, fid);
    }
    setHiddenUsers(list.id, list.owner_user_id, form.getAll("hidden").map(Number).filter((id) => id !== user.id));
    // Only the profile's owner decides who else co-owns the list.
    if (list.owner_user_id === user.id) {
      run("DELETE FROM list_owners WHERE list_id = ?", list.id);
      for (const uid of form.getAll("owners").map(Number)) {
        if (people.has(uid)) run("INSERT OR IGNORE INTO list_owners (list_id, user_id) VALUES (?, ?)", list.id, uid);
      }
    }
  });
  redirect(`/lists/${list.id}?ok=Saved`);
}

export async function quickHide(form: FormData) {
  const { list } = await ownList(n(form, "list_id"));
  const uid = n(form, "user_id");
  if (s(form, "action") === "unhide") run("DELETE FROM list_hidden_users WHERE list_id = ? AND user_id = ?", list.id, uid);
  else if (familyPeople(list.owner_user_id).some((p) => p.id === uid)) run("INSERT OR IGNORE INTO list_hidden_users (list_id, user_id) VALUES (?, ?)", list.id, uid);
  revalidatePath(`/lists/${list.id}/share`);
}

export async function deleteList(form: FormData) {
  const { user, list } = await ownList(n(form, "list_id"));
  if (list.owner_user_id !== user.id) redirect(`/lists/${list.id}?error=Only+the+main+owner+can+delete+this+list`);
  run("DELETE FROM lists WHERE id = ?", list.id);
  redirect("/?ok=List+deleted");
}

// Copy a list (e.g. last year's) for one of my profiles. Only its managers can copy it.
export async function duplicateList(form: FormData) {
  const { user, list } = await viewList(n(form, "list_id"));
  if (!isManager(user.id, list)) redirect(`/lists/${list.id}`);
  const profile = profileById(n(form, "profile_id"));
  if (!profile || profile.user_id !== user.id) redirect(`/lists/${list.id}/edit?error=Pick+one+of+your+profiles`);
  const id = copyList(list, profile, s(form, "title") || `${list.title} (copy)`, user.id);
  redirect(`/lists/${id}?ok=List+copied`);
}

export async function makeViewLink(form: FormData) {
  const { list } = await ownList(n(form, "list_id"));
  viewToken(list.id, true);
  redirect(`/lists/${list.id}/print`);
}

// A new secret link (old QR codes stop working), or none at all.
export async function resetViewLink(form: FormData) {
  const { list } = await ownList(n(form, "list_id"));
  run("UPDATE lists SET view_token = NULL WHERE id = ?", list.id);
  if (!form.get("off")) viewToken(list.id, true);
  redirect(`/lists/${list.id}/print`);
}
