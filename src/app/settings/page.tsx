import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { myProfiles } from "@/lib/access";
import { logout } from "../actions/auth";
import { deleteProfile, rollAvatar, saveAccount, saveProfile } from "../actions/app";
import { AvatarPicker, parseCollection } from "@/components/AvatarPicker";
import { Avatar, avatarLabel, avatarTier, TIER_LABEL } from "@/components/Avatar";
import { ThemePicker } from "@/components/ThemePicker";
import { SecurityPanel } from "@/components/settings/SecurityPanel";
import { AdminPanel } from "@/components/settings/AdminPanel";
import { Flash, type SP } from "@/components/Flash";

const TABS = [
  { id: "me", label: "👤 Me & look" },
  { id: "profiles", label: "🧒 Kids & profiles" },
  { id: "security", label: "🔐 Sign-in & 2FA" },
  { id: "admin", label: "🛠️ Server", admin: true },
] as const;

function RollCard({ rolled, profileId }: { rolled?: string; profileId?: number }) {
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
      <form action={rollAvatar}>
        {profileId ? <input type="hidden" name="profile_id" value={profileId} /> : null}
        <button className="btn secondary">🎲 Roll a random critter</button>
      </form>
      <p className="tiny muted" style={{ margin: 0 }}>Common, Rare and Epic geese and raccoons. Space Goose is Legendary (2% chance). Every roll joins your collection.</p>
    </div>
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
  const collection = parseCollection(user.unlocked_avatars);

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Settings</h1>
        <form action={logout}><button className="btn small ghost">Sign out</button></form>
      </div>
      <nav className="tabs">
        {TABS.filter((t) => !("admin" in t) || user.is_admin).map((t) => (
          <Link key={t.id} href={`/settings?tab=${t.id}`} className={tab === t.id ? "active" : ""}>{t.label}</Link>
        ))}
        <Link href="/families">🏡 Families</Link>
        <Link href="/purchases">🛍️ My purchases</Link>
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
            <RollCard rolled={rolled} />
          </section>
          <form action={saveAccount} className="card stack">
            <h2>You</h2>
            <div className="form-grid">
              <label>Name<input name="name" defaultValue={user.name} required /></label>
              <label>Birthday<input name="birthday" type="date" defaultValue={primary?.birthday ?? ""} /></label>
            </div>
            <p className="small muted" style={{ margin: 0 }}>{user.email}</p>
            <div><p className="small" style={{ fontWeight: 600, marginBottom: 6 }}>Avatar ({collection.length} rolled)</p><AvatarPicker value={user.avatar} collection={collection} /></div>
            <div><p className="small" style={{ fontWeight: 600, marginBottom: 6 }}>Theme</p><ThemePicker value={user.theme} /></div>
            <button className="btn">Save</button>
          </form>
        </>
      )}

      {tab === "profiles" && (
        <section className="card stack">
          <h2>Profiles you manage</h2>
          <p className="small muted" style={{ margin: 0 }}>Kids (or pets!) who don&apos;t need their own login. Their lists show up for your families, and you see who&apos;s buying what so you can coordinate.</p>
          {others.map((p) => (
            <details key={p.id} className="card" open={rolled !== undefined && p.avatar === rolled}>
              <summary><span className="row" style={{ display: "inline-flex", gap: 8 }}><Avatar id={p.avatar} size={28} />{p.name}</span></summary>
              <RollCard rolled={p.avatar === rolled ? rolled : undefined} profileId={p.id} />
              <form action={saveProfile} className="stack" style={{ marginTop: 12 }}>
                <input type="hidden" name="profile_id" value={p.id} />
                <div className="form-grid">
                  <label>Name<input name="name" defaultValue={p.name} required /></label>
                  <label>Birthday<input name="birthday" type="date" defaultValue={p.birthday ?? ""} /></label>
                </div>
                <AvatarPicker value={p.avatar} collection={collection} />
                <button className="btn">Save profile</button>
              </form>
              <form action={deleteProfile} style={{ marginTop: 10 }}>
                <input type="hidden" name="profile_id" value={p.id} />
                <button className="btn small danger">Remove profile and its lists</button>
              </form>
            </details>
          ))}
          <details className="card" open={others.length === 0}>
            <summary>Add a profile</summary>
            <form action={saveProfile} className="stack">
              <div className="form-grid">
                <label>Name<input name="name" required placeholder="Maya" /></label>
                <label>Birthday (helps with gift ideas)<input name="birthday" type="date" /></label>
              </div>
              <AvatarPicker value="goose" collection={collection} />
              <button className="btn">Add profile</button>
            </form>
          </details>
        </section>
      )}

      {tab === "security" && <SecurityPanel user={user} />}
      {tab === "admin" && user.is_admin ? <AdminPanel me={user} /> : null}
    </div>
  );
}
