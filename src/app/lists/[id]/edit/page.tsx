import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { familyPeople, getList, myProfiles, shareableFamilies } from "@/lib/access";
import { all } from "@/lib/db";
import { deleteList, updateList } from "../../../actions/app";
import { EmojiPicker } from "@/components/EmojiPicker";
import { Avatar } from "@/components/Avatar";
import { Flash, type SP } from "@/components/Flash";

export default async function EditListPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const user = await requireUser();
  const list = getList(Number((await params).id));
  if (!list || list.owner_user_id !== user.id) notFound();
  const families = shareableFamilies(user.id);
  const people = familyPeople(user.id);
  const profiles = myProfiles(user.id);
  const chosen = new Set(all<{ family_id: number }>("SELECT family_id FROM list_families WHERE list_id = ?", list.id).map((r) => r.family_id));
  const hidden = new Set(all<{ user_id: number }>("SELECT user_id FROM list_hidden_users WHERE list_id = ?", list.id).map((r) => r.user_id));

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      <p><Link href={`/lists/${list.id}`}>← Back to list</Link></p>
      <h1>Edit list</h1>
      <Flash searchParams={searchParams} />
      <form action={updateList} className="stack">
        <input type="hidden" name="list_id" value={list.id} />
        <div className="card stack">
          <label>List name<input name="title" defaultValue={list.title} required /></label>
          <label>For
            <select name="profile_id" defaultValue={list.profile_id}>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.is_primary ? `${p.name} (me)` : p.name}</option>)}
            </select>
          </label>
          <EmojiPicker value={list.emoji} />
          <div className="form-grid">
            <label>Occasion<input name="occasion" defaultValue={list.occasion} /></label>
            <label>Date<input name="event_date" type="date" defaultValue={list.event_date ?? ""} /></label>
          </div>
          <label>Description<textarea name="description" defaultValue={list.description} /></label>
        </div>

        <div className="card stack">
          <h2>Who can see it</h2>
          <label className="inline"><input type="radio" name="visibility" value="family" defaultChecked={list.visibility === "family"} /> Everyone in my families</label>
          <label className="inline"><input type="radio" name="visibility" value="custom" defaultChecked={list.visibility === "custom"} /> Only the families I pick below</label>
          <label className="inline"><input type="radio" name="visibility" value="private" defaultChecked={list.visibility === "private"} /> Only me (hidden from everyone)</label>
          {families.length > 0 && (
            <div className="stack" style={{ paddingLeft: 8, borderLeft: "3px solid var(--border)" }}>
              <p className="small muted" style={{ margin: 0 }}>Families for &quot;only the families I pick&quot;:</p>
              {families.map((f) => (
                <label key={f.id} className="inline">
                  <input type="checkbox" name="families" value={f.id} defaultChecked={chosen.has(f.id)} />
                  {f.name} {f.connected ? <span className="pill">connected family</span> : null}
                </label>
              ))}
            </div>
          )}
        </div>

        {people.length > 0 && (
          <div className="card stack">
            <h2>Hide from specific people</h2>
            <p className="small muted" style={{ margin: 0 }}>They won&apos;t see this list at all, even if they&apos;re in a family it&apos;s shared with.</p>
            {people.map((p) => (
              <label key={p.id} className="inline">
                <input type="checkbox" name="hidden" value={p.id} defaultChecked={hidden.has(p.id)} />
                <Avatar id={p.avatar} size={26} /> {p.name}
              </label>
            ))}
          </div>
        )}
        <button className="btn">Save</button>
      </form>

      <form action={deleteList} className="card" style={{ marginTop: 24 }}>
        <input type="hidden" name="list_id" value={list.id} />
        <div className="row between">
          <span className="muted small">Deleting removes the list and all its wishes.</span>
          <button className="btn danger small">Delete list</button>
        </div>
      </form>
    </div>
  );
}
