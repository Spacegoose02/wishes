import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { familyProfiles, myProfiles } from "@/lib/access";
import type { Profile } from "@/lib/types";
import { logout } from "../actions/auth";
import { deleteProfile, resetCalendarLink, rollAvatar, saveAccount, saveProfile } from "../actions/account";
import { CopyButton } from "@/components/CopyButton";
import { siteOrigin } from "@/lib/origin";
import { AvatarPicker, parseCollection } from "@/components/AvatarPicker";
import { Avatar, avatarLabel, avatarTier, TIER_LABEL } from "@/components/Avatar";
import { ThemePicker } from "@/components/ThemePicker";
import { ProfileDetailsFields } from "@/components/ProfileDetailsFields";
import { SecurityPanel } from "@/components/settings/SecurityPanel";
import { AdminPanel } from "@/components/settings/AdminPanel";
import { Flash, type SP } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { BADGES, parseBadges } from "@/lib/rewards";

export const metadata = { title: "Settings" };

const TABS = [
  { id: "me", label: "👤 Me & look" },
  { id: "profiles", label: "🧒 Kids & profiles" },
  { id: "security", label: "🔐 Sign-in & 2FA" },
  { id: "admin", label: "🛠️ Server", admin: true },
] as const;

function RollCard({ rolled, profileId, golden = 0 }: { rolled?: string; profileId?: number; golden?: number }) {
  return (
    <div className="roll-card">
      {rolled && (
        <div className={`rolled tier-${avatarTier(rolled)}`}>
          <Avatar id={rolled} size={84} />
          <div>
            <strong>{avatarTier(rolled) === "legendary" ? "🚀 LEGENDARY! " : "You got "}{avatarLabel(rolled)}</strong>
            <div className={`tier tier-${avatarTier(rolled)}`}>{TIER_LABEL[avatarTier(rolled)]}</div>
          </div>
        </div>
      )}
      <div className="row gap-6">
        <form action={rollAvatar}>
          {profileId ? <input type="hidden" name="profile_id" value={profileId} /> : null}
          <SubmitButton className="btn secondary">🎲 Roll a random critter</SubmitButton>
        </form>
        {golden > 0 && (
          <form action={rollAvatar}>
            {profileId ? <input type="hidden" name="profile_id" value={profileId} /> : null}
            <input type="hidden" name="golden" value="1" />
            <SubmitButton className="btn">✨ Golden roll ({golden} left)</SubmitButton>
          </form>
        )}
      </div>
      <p className="tiny muted m0">Common, Rare and Epic geese and raccoons. Space Goose is Legendary (2% chance). Every roll joins your collection.</p>
    </div>
  );
}

function ProfileCard({ p, open, rolled, collection, canDelete, note, golden }: { p: Profile; open: boolean; rolled?: string; collection: string[]; canDelete?: boolean; note?: string; golden?: number }) {
  return (
    <details id={`profile-${p.id}`} className="card" open={open}>
      <summary>
        <span className="row gap-8" style={{ display: "inline-flex" }}>
          <Avatar id={p.avatar} size={28} />{p.name}{note && <span className="tiny muted">{note}</span>}<span className="small muted">✏️ Edit</span>
        </span>
      </summary>
      {canDelete && <RollCard rolled={p.avatar === rolled ? rolled : undefined} profileId={p.id} golden={golden} />}
      <form action={saveProfile} className="stack mt-12">
        <input type="hidden" name="profile_id" value={p.id} />
        <div className="form-grid">
          <label>Name<input name="name" defaultValue={p.name} required /></label>
          <label>Birthday<input name="birthday" type="date" defaultValue={p.birthday ?? ""} /></label>
        </div>
        <ProfileDetailsFields p={p} />
        <AvatarPicker value={p.avatar} collection={collection} />
        <SubmitButton className="btn">Save profile</SubmitButton>
      </form>
      {canDelete && (
        <form action={deleteProfile} className="mt-10">
          <input type="hidden" name="profile_id" value={p.id} />
          <SubmitButton className="btn small danger" confirm="Remove profile and all its lists?">Remove profile and its lists</SubmitButton>
        </form>
      )}
    </details>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.id === sp.tab && (!("admin" in t) || user.is_admin))?.id ?? "me";
  const rolled = typeof sp.rolled === "string" ? sp.rolled : undefined;
  const profiles = myProfiles(user.id);
  const primary = profiles.find((p) => p.is_primary);
  const others = profiles.filter((p) => !p.is_primary);
  const familyKids = familyProfiles(user.id).filter((p) => !p.is_primary && !p.linked_user_id);
  const editId = Number(sp.edit) || 0;
  const collection = parseCollection(user.unlocked_avatars);
  const badges = parseBadges(user.badges);

  return (
    <div className="narrow-860">
      <div className="section-head">
        <h1 className="m0">Settings</h1>
        <form action={logout}><SubmitButton className="btn small ghost">Sign out</SubmitButton></form>
      </div>
      <nav className="tabs">
        {TABS.filter((t) => !("admin" in t) || user.is_admin).map((t) => (
          <Link key={t.id} href={`/settings?tab=${t.id}`} className={tab === t.id ? "active" : ""}>{t.label}</Link>
        ))}
        <Link href="/families">🏡 Families</Link>
        <Link href="/purchases">🛍️ My shopping</Link>
      </nav>
      <Flash searchParams={searchParams} />

      {tab === "me" && (
        <>
          <section className="card stack">
            <h2>Your critter</h2>
            <div className="row">
              <Avatar id={user.avatar} size={72} />
              <div><strong>{avatarLabel(user.avatar)}</strong><div className={`tier tier-${avatarTier(user.avatar)}`}>{TIER_LABEL[avatarTier(user.avatar)]}</div></div>
            </div>
            <RollCard rolled={rolled} golden={user.bonus_rolls} />
            <div>
              <p className="small fw-700 mb-6">Badges</p>
              <div className="row chips gap-6">
                {Object.entries(BADGES).map(([id, b]) => {
                  const got = badges.includes(id as keyof typeof BADGES);
                  return <span key={id} className={`pill${got ? " accent" : ""}`} title={got ? "Earned" : "Not yet"}>{got ? b.icon : "🔒"} {b.label}</span>;
                })}
              </div>
              <p className="tiny muted m0 mt-6">Each badge earns a golden roll: Rare or better, guaranteed.</p>
            </div>
          </section>
          <section id="calendar" className="card stack">
            <h2 className="m0">📅 Calendar feed</h2>
            <p className="small muted m0">Birthdays and list dates you can see, in your phone&apos;s calendar. Keep the link to yourself.</p>
            {user.calendar_token ? (
              <>
                <div className="row nowrap">
                  <input readOnly value={`${await siteOrigin()}/calendar/${user.calendar_token}.ics`} aria-label="Calendar link" />
                  <CopyButton text={`/calendar/${user.calendar_token}.ics`} />
                </div>
                <form action={resetCalendarLink}><input type="hidden" name="reset" value="1" /><SubmitButton className="btn small ghost" confirm="The old link stops working. Sure?">New link</SubmitButton></form>
              </>
            ) : (
              <form action={resetCalendarLink}><SubmitButton className="btn small secondary">Turn on calendar feed</SubmitButton></form>
            )}
          </section>
          <form action={saveAccount} className="card stack">
            <h2>You</h2>
            <div className="form-grid">
              <label>Name<input name="name" defaultValue={user.name} required /></label>
              <label>Birthday<input name="birthday" type="date" defaultValue={primary?.birthday ?? ""} /></label>
            </div>
            <p className="small muted m0">{user.email}</p>
            <ProfileDetailsFields p={primary} />
            <div><p className="small fw-600 mb-6">Avatar ({collection.length} rolled)</p><AvatarPicker value={user.avatar} collection={collection} /></div>
            <div><p className="small fw-600 mb-6">Theme</p><ThemePicker value={user.theme} /></div>
            <SubmitButton className="btn">Save</SubmitButton>
          </form>
        </>
      )}

      {tab === "profiles" && (
        <>
          <section className="card stack">
            <h2>Profiles you manage</h2>
            <p className="small muted m0">Kids (or pets, or grandparents!) who don&apos;t need their own login. Their lists show up for your families, and you see who&apos;s buying what so you can coordinate.</p>
            {others.map((p) => (
              <ProfileCard key={p.id} p={p} open={editId === p.id || (rolled !== undefined && p.avatar === rolled)} rolled={rolled} collection={collection} canDelete golden={user.bonus_rolls} note={p.linked_user_id ? "secret lists, hidden from them" : undefined} />
            ))}
            <details className="card" open={others.length === 0}>
              <summary>Add a profile</summary>
              <form action={saveProfile} className="stack">
                <div className="form-grid">
                  <label>Name<input name="name" required placeholder="Maya" /></label>
                  <label>Birthday (helps with gift ideas)<input name="birthday" type="date" /></label>
                </div>
                <ProfileDetailsFields />
                <AvatarPicker value="goose" collection={collection} />
                <SubmitButton className="btn">Add profile</SubmitButton>
              </form>
            </details>
          </section>
          {familyKids.length > 0 && (
            <section className="card stack">
              <h2>Kids in your families</h2>
              <p className="small muted m0">Anyone in the family can fix a kid&apos;s name, birthday or critter.</p>
              {familyKids.map((p) => (
                <ProfileCard key={p.id} p={p} open={editId === p.id} collection={collection} note={`managed by ${p.owner_name}`} />
              ))}
            </section>
          )}
        </>
      )}

      {tab === "security" && <SecurityPanel user={user} />}
      {tab === "admin" && user.is_admin ? <AdminPanel me={user} /> : null}
    </div>
  );
}
