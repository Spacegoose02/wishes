import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { familyPeople, getList, isManager, myProfiles, shareableFamilies } from "@/lib/access";
import { all } from "@/lib/db";
import { deleteList, updateList } from "../../../actions/app";
import { EmojiPicker } from "@/components/EmojiPicker";
import { Avatar } from "@/components/Avatar";
import { Flash, type SP } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";

export default async function EditListPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const user = await requireUser();
  const list = getList(Number((await params).id));
  if (!list || !isManager(user.id, list)) notFound();
  const mainOwner = list.owner_user_id === user.id;
  const families = shareableFamilies(list.owner_user_id);
  const people = familyPeople(list.owner_user_id);
  const profiles = myProfiles(list.owner_user_id);
  const owners = new Set(all<{ user_id: number }>("SELECT user_id FROM list_owners WHERE list_id = ?", list.id).map((r) => r.user_id));
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
            <select name="profile_id" defaultValue={list.profile_id} disabled={!mainOwner}>
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

        <div className="card stack">
          <h2>Purchases</h2>
          <p className="small" style={{ margin: 0 }}>When someone who doesn&apos;t manage this list marks a gift as bought:</p>
          <label className="inline">
            <input type="radio" name="review_purchases" value="" defaultChecked={!list.review_purchases} />
            Approve it automatically
          </label>
          <label className="inline">
            <input type="radio" name="review_purchases" value="1" defaultChecked={!!list.review_purchases} />
            Send it to a list manager to review first
          </label>
          <p className="tiny muted" style={{ margin: 0 }}>
            When someone else marks a gift as bought, it shows as &quot;waiting for review&quot; until a list manager confirms it.
            {list.profile_is_primary ? " Reviews go to co-owners. You won't see them on your own list, so the surprise stays safe." : ""}
          </p>
        </div>

        {mainOwner && people.length > 0 && (
          <div className="card stack">
            <h2>Co-owners</h2>
            <p className="small muted" style={{ margin: 0 }}>Co-owners can add, edit and remove wishes, change sharing, and review purchases. Great for two parents running a kid&apos;s list.</p>
            {people.map((p) => (
              <label key={p.id} className="inline">
                <input type="checkbox" name="owners" value={p.id} defaultChecked={owners.has(p.id)} />
                <Avatar id={p.avatar} size={26} /> {p.name}
              </label>
            ))}
          </div>
        )}

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

      {mainOwner && <form action={deleteList} className="card" style={{ marginTop: 24 }}>
        <input type="hidden" name="list_id" value={list.id} />
        <div className="row between">
          <span className="muted small">Deleting removes the list and all its wishes.</span>
          <SubmitButton className="btn danger small" confirm="Delete for good?">Delete list</SubmitButton>
        </div>
      </form>}
    </div>
  );
}
