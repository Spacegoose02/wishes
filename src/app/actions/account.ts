"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { get, run } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { canEditProfile } from "@/lib/access";
import type { Profile } from "@/lib/types";
import { rollAvatar as roll } from "@/components/Avatar";
import { parseCollection } from "@/components/AvatarPicker";
import { spendBonusRoll } from "@/lib/rewards";
import { calendarToken } from "@/lib/calendar";
import { sizesFromForm } from "@/lib/profile";
import { notify } from "@/lib/notify";
import { removeSubscription, saveSubscription, validSubscription } from "@/lib/push";
import { s, n, THEMES, avatarFor, details } from "./_shared";

export async function saveAccount(form: FormData) {
  const user = await requireUser();
  const name = s(form, "name") || user.name;
  const avatar = avatarFor(user, s(form, "avatar"), user.avatar);
  const theme = THEMES.includes(s(form, "theme")) ? s(form, "theme") : user.theme;
  run("UPDATE users SET name = ?, avatar = ?, theme = ? WHERE id = ?", name, avatar, theme, user.id);
  run("UPDATE profiles SET sizes_updated_at = unixepoch() WHERE user_id = ? AND is_primary = 1 AND sizes IS NOT ?", user.id, sizesFromForm(form));
  run(
    "UPDATE profiles SET name = ?, avatar = ?, birthday = ?, age = ?, likes = ?, dislikes = ?, sizes = ?, gift_notes = ? WHERE user_id = ? AND is_primary = 1",
    name, avatar, s(form, "birthday") || null, ...details(form), user.id,
  );
  redirect("/settings?ok=Saved");
}

// Roll a random critter into the user's collection (and wear it). Space Goose is the 2% legendary.
// Golden rolls, earned with badges, never land on a common.
export async function rollAvatar(form: FormData) {
  const user = await requireUser();
  const golden = s(form, "golden") === "1" && spendBonusRoll(user.id);
  const got = roll(Math.random, golden);
  const collection = [got, ...parseCollection(user.unlocked_avatars).filter((a) => a !== got)].slice(0, 24);
  run("UPDATE users SET unlocked_avatars = ? WHERE id = ?", collection.join(","), user.id);
  const profileId = n(form, "profile_id");
  if (profileId) run("UPDATE profiles SET avatar = ? WHERE id = ? AND user_id = ?", got, profileId, user.id);
  else {
    run("UPDATE users SET avatar = ? WHERE id = ?", got, user.id);
    run("UPDATE profiles SET avatar = ? WHERE user_id = ? AND is_primary = 1", got, user.id);
  }
  redirect(`/settings?tab=${profileId ? "profiles" : "me"}&rolled=${encodeURIComponent(got)}`);
}

export async function saveProfile(form: FormData) {
  const user = await requireUser();
  const id = n(form, "profile_id");
  const name = s(form, "name").slice(0, 60);
  const back = s(form, "back").startsWith("/") ? s(form, "back") : "/settings?tab=profiles";
  const join = back.includes("?") ? "&" : "?";
  if (!name) redirect(back + join + "error=Profiles+need+a+name");
  let avatar = avatarFor(user, s(form, "avatar"), "goose");
  if (id) {
    const profile = get<Profile>("SELECT * FROM profiles WHERE id = ?", id);
    if (!profile || !canEditProfile(user.id, profile)) redirect(back + join + "error=You+can't+edit+that+profile");
    if (profile.is_primary) redirect(back + join + "error=Change+your+own+name+on+the+Me+tab");
    // Keep the kid's current critter even if it came from another parent's collection.
    if (s(form, "avatar") === profile.avatar) avatar = profile.avatar;
    run("UPDATE profiles SET sizes_updated_at = unixepoch() WHERE id = ? AND sizes IS NOT ?", profile.id, sizesFromForm(form));
    run(
      "UPDATE profiles SET name = ?, avatar = ?, birthday = ?, age = ?, likes = ?, dislikes = ?, sizes = ?, gift_notes = ? WHERE id = ?",
      name, avatar, s(form, "birthday") || null, ...details(form), profile.id,
    );
  } else {
    run(
      "INSERT INTO profiles (user_id, name, avatar, birthday, age, likes, dislikes, sizes, gift_notes, sizes_updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())",
      user.id, name, avatar, s(form, "birthday") || null, ...details(form),
    );
  }
  redirect(back + join + "ok=Profile+saved");
}

// Quick rename from wherever the kid's name shows; touches nothing but the name.
export async function renameProfile(form: FormData) {
  const user = await requireUser();
  const profile = get<Profile>("SELECT * FROM profiles WHERE id = ?", n(form, "profile_id"));
  const back = s(form, "back").startsWith("/") ? s(form, "back") : "/";
  const join = back.includes("?") ? "&" : "?";
  const name = s(form, "name").slice(0, 60);
  if (!profile || !canEditProfile(user.id, profile) || profile.is_primary) redirect(back + join + "error=You+can't+rename+that+profile");
  if (!name) redirect(back + join + "error=Names+can't+be+empty");
  run("UPDATE profiles SET name = ? WHERE id = ?", name, profile.id);
  redirect(back + join + "ok=" + encodeURIComponent("Renamed to " + name));
}

export async function deleteProfile(form: FormData) {
  const user = await requireUser();
  run("DELETE FROM profiles WHERE id = ? AND user_id = ? AND is_primary = 0", n(form, "profile_id"), user.id);
  redirect("/settings?tab=profiles&ok=Profile+removed");
}

export async function markAllRead() {
  const user = await requireUser();
  run("UPDATE notifications SET read = 1 WHERE user_id = ?", user.id);
  revalidatePath("/", "layout");
}

// Turn on the calendar feed, or swap its secret link for a new one.
export async function resetCalendarLink(form: FormData) {
  const user = await requireUser();
  calendarToken(user.id, !!form.get("reset"));
  redirect("/settings?tab=me&ok=" + encodeURIComponent(form.get("reset") ? "New calendar link made. Re-subscribe with it." : "Calendar feed is on") + "#calendar");
}

// "Sizes still fit": push the size check out another six months.
export async function confirmSizes(form: FormData) {
  const user = await requireUser();
  const profile = get<Profile>("SELECT * FROM profiles WHERE id = ?", n(form, "profile_id"));
  if (!profile || !canEditProfile(user.id, profile)) redirect("/");
  run("UPDATE profiles SET sizes_updated_at = unixepoch() WHERE id = ?", profile.id);
  redirect("/?ok=" + encodeURIComponent(`Thanks! We'll ask about ${profile.name}'s sizes again in six months.`));
}

// Which alerts go out besides the Alerts page.
export async function saveAlerts(form: FormData) {
  const user = await requireUser();
  run(
    "UPDATE users SET alert_email = ?, alert_push = ?, alert_new_wishes = ? WHERE id = ?",
    form.get("alert_email") ? 1 : 0, form.get("alert_push") ? 1 : 0, form.get("alert_new_wishes") ? 1 : 0, user.id,
  );
  redirect("/settings?tab=alerts&ok=Alert+settings+saved");
}

// Called by the browser after it subscribes (or unsubscribes) this device for push.
export async function savePushSubscription(json: string): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: "That subscription didn't make sense." };
  }
  const sub = validSubscription(parsed);
  if (!sub) return { ok: false, error: "This browser's push service isn't supported." };
  saveSubscription(user.id, sub);
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  const user = await requireUser();
  removeSubscription(user.id, endpoint);
}

export async function sendTestAlert() {
  const user = await requireUser();
  notify(user.id, "info", "This is a test alert from Wishes. If you can read it here, it works! 🎉", "/settings?tab=alerts");
  redirect("/settings?tab=alerts&ok=" + encodeURIComponent("Test alert sent. It can take a minute to arrive."));
}
