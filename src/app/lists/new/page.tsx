import { requireUser } from "@/lib/auth";
import { familyPeople, familyProfiles, myProfiles } from "@/lib/access";
import { Avatar } from "@/components/Avatar";
import { createList } from "../../actions/app";
import { Flash, type SP } from "@/components/Flash";
import { EmojiPicker } from "@/components/EmojiPicker";

export default async function NewListPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const mine = myProfiles(user.id);
  const people = familyPeople(user.id);
  const familyKids = familyProfiles(user.id).filter((p) => !p.is_primary && !p.linked_user_id);
  const sp = await searchParams;
  const pre = typeof sp.for === "string" ? sp.for : sp.profile ? `p:${sp.profile}` : `p:${mine[0]?.id}`;
  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <h1>New wishlist</h1>
      <form action={createList} className="card stack">
        <Flash searchParams={searchParams} />
        <label>Who is it for?
          <select name="for" defaultValue={pre}>
            <optgroup label="Me and my profiles">
              {mine.map((p) => (
                <option key={p.id} value={`p:${p.id}`}>{p.is_primary ? `${p.name} (me)` : p.name}</option>
              ))}
            </optgroup>
            {people.length > 0 && (
              <optgroup label="People in my families">
                {people.map((p) => <option key={p.id} value={`u:${p.id}`}>{p.name}</option>)}
              </optgroup>
            )}
            {familyKids.length > 0 && (
              <optgroup label="Kids in my families">
                {familyKids.map((p) => <option key={p.id} value={`p:${p.id}`}>{p.name} ({p.owner_name}&apos;s)</option>)}
              </optgroup>
            )}
            <option value="new">Someone else (type a name below)</option>
          </select>
        </label>
        <label>…or a new name
          <input name="new_name" placeholder="Grandpa Joe, Baby Ava, the dog…" />
        </label>
        {people.length > 0 && (
          <label className="inline">
            <input type="checkbox" name="secret" />
            If it&apos;s for a family member: keep it a secret from them (a gift-idea list they can&apos;t see)
          </label>
        )}
        <p className="tiny muted" style={{ margin: 0 }}>
          Lists you make for someone else make you a co-owner, so you can keep adding to them. A list for a family member normally shows up on their page too.
        </p>
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
        <button className="btn">Create list</button>
      </form>
    </div>
  );
}
