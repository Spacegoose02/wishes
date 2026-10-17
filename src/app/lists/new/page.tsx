import { requireUser } from "@/lib/auth";
import { familyPeople, myProfiles } from "@/lib/access";
import { Avatar } from "@/components/Avatar";
import { createList } from "../../actions/app";
import { Flash, type SP } from "@/components/Flash";
import { EmojiPicker } from "@/components/EmojiPicker";

export default async function NewListPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const profiles = myProfiles(user.id);
  const people = familyPeople(user.id);
  const sp = await searchParams;
  const pre = Number(sp.profile) || profiles[0]?.id;
  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <h1>New wishlist</h1>
      <form action={createList} className="card stack">
        <Flash searchParams={searchParams} />
        <label>Who is it for?
          <select name="profile_id" defaultValue={pre}>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.is_primary ? `${p.name} (me)` : p.name}</option>)}
          </select>
        </label>
        <label>List name<input name="title" placeholder="Birthday 2026" required /></label>
        <EmojiPicker />
        <div className="form-grid">
          <label>Occasion<input name="occasion" placeholder="Birthday, Christmas, Wedding…" /></label>
          <label>Date<input name="event_date" type="date" /></label>
        </div>
        <label>Description<textarea name="description" placeholder="Sizes, favorite colors, things to avoid…" /></label>
        <label>Who can see it?
          <select name="visibility" defaultValue="family">
            <option value="family">My families</option>
            <option value="private">Only me (hidden)</option>
          </select>
        </label>
        {people.length > 0 && (
          <fieldset className="stack" style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, margin: 0 }}>
            <legend className="small" style={{ fontWeight: 700, padding: "0 6px" }}>Hide it from…</legend>
            {people.map((p) => (
              <label key={p.id} className="inline"><input type="checkbox" name="hidden" value={p.id} /><Avatar id={p.avatar} size={24} /> {p.name}</label>
            ))}
          </fieldset>
        )}
        <p className="tiny muted" style={{ margin: 0 }}>After creating it you can share with connected families, hide it from specific people, or invite guests by email.</p>
        <button className="btn">Create list</button>
      </form>
    </div>
  );
}
