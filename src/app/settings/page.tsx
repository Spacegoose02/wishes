import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { myProfiles } from "@/lib/access";
import { logout } from "../actions/auth";
import { deleteProfile, saveAccount, saveProfile } from "../actions/app";
import { AvatarPicker } from "@/components/AvatarPicker";
import { Avatar } from "@/components/Avatar";
import { ThemePicker } from "@/components/ThemePicker";
import { Flash, type SP } from "@/components/Flash";

export default async function SettingsPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const profiles = myProfiles(user.id);
  const primary = profiles.find((p) => p.is_primary);
  const others = profiles.filter((p) => !p.is_primary);
  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Settings</h1>
        <div className="row" style={{ gap: 6 }}>
          <Link href="/settings/security" className="btn small secondary">Password &amp; 2FA</Link>
          <form action={logout}><button className="btn small ghost">Sign out</button></form>
        </div>
      </div>
      <Flash searchParams={searchParams} />

      <form action={saveAccount} className="card stack">
        <h2>You</h2>
        <div className="form-grid">
          <label>Name<input name="name" defaultValue={user.name} required /></label>
          <label>Birthday<input name="birthday" type="date" defaultValue={primary?.birthday ?? ""} /></label>
        </div>
        <p className="small muted" style={{ margin: 0 }}>{user.email}</p>
        <div><p className="small" style={{ fontWeight: 600, marginBottom: 6 }}>Avatar</p><AvatarPicker value={user.avatar} /></div>
        <div><p className="small" style={{ fontWeight: 600, marginBottom: 6 }}>Theme</p><ThemePicker value={user.theme} /></div>
        <button className="btn">Save</button>
      </form>

      <section className="card stack">
        <h2>Profiles you manage</h2>
        <p className="small muted" style={{ margin: 0 }}>Kids (or pets!) who don&apos;t need their own login. Their lists show up for your families, and you&apos;ll see who&apos;s claimed what so you can coordinate.</p>
        {others.map((p) => (
          <details key={p.id} className="card">
            <summary><span className="row" style={{ display: "inline-flex", gap: 8 }}><Avatar id={p.avatar} size={28} />{p.name}</span></summary>
            <form action={saveProfile} className="stack">
              <input type="hidden" name="profile_id" value={p.id} />
              <div className="form-grid">
                <label>Name<input name="name" defaultValue={p.name} required /></label>
                <label>Birthday<input name="birthday" type="date" defaultValue={p.birthday ?? ""} /></label>
              </div>
              <AvatarPicker value={p.avatar} />
              <button className="btn">Save profile</button>
            </form>
            <form action={deleteProfile} style={{ marginTop: 10 }}>
              <input type="hidden" name="profile_id" value={p.id} />
              <button className="btn small danger">Remove profile and its lists</button>
            </form>
          </details>
        ))}
        <details className="card">
          <summary>Add a profile</summary>
          <form action={saveProfile} className="stack">
            <div className="form-grid">
              <label>Name<input name="name" required placeholder="Maya" /></label>
              <label>Birthday (helps with gift ideas)<input name="birthday" type="date" /></label>
            </div>
            <AvatarPicker value="goose" />
            <button className="btn">Add profile</button>
          </form>
        </details>
      </section>
    </div>
  );
}
