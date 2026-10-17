import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { familyPeople, getList, isManager } from "@/lib/access";
import { all } from "@/lib/db";
import { addGuest, quickHide, removeGuest } from "../../../actions/app";
import { Avatar } from "@/components/Avatar";
import { CopyButton } from "@/components/CopyButton";
import { Flash, type SP } from "@/components/Flash";

const VIS: Record<string, string> = {
  private: "Hidden. Only you can see it.",
  family: "Everyone in your families can see it.",
  custom: "Only the families you picked can see it.",
};

export default async function SharePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const user = await requireUser();
  const list = getList(Number((await params).id));
  if (!list || !isManager(user.id, list)) notFound();
  const people = familyPeople(list.owner_user_id).filter((p) => p.id !== user.id);
  const hidden = new Set(all<{ user_id: number }>("SELECT user_id FROM list_hidden_users WHERE list_id = ?", list.id).map((r) => r.user_id));
  const guests = all<{ id: number; email: string; token: string; can_edit: number }>(
    "SELECT * FROM list_guests WHERE list_id = ? ORDER BY created_at", list.id,
  );
  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      <p><Link href={`/lists/${list.id}`}>← Back to list</Link></p>
      <h1>Share &quot;{list.title}&quot;</h1>
      <Flash searchParams={searchParams} />
      <div className="card">
        <h2>Families</h2>
        <p className="muted">{VIS[list.visibility]}</p>
        <Link href={`/lists/${list.id}/edit`} className="btn small secondary">Change who can see it</Link>
      </div>
      <div className="card stack">
        <h2>Hide from specific people</h2>
        <p className="small muted" style={{ margin: 0 }}>
          Keep this list away from someone even though they&apos;re in your family, like a partner you&apos;re shopping for or the kids.
        </p>
        {people.length === 0 && <p className="small muted" style={{ margin: 0 }}>Nobody else is in your families yet.</p>}
        {people.map((p) => {
          const isHidden = hidden.has(p.id);
          return (
            <div key={p.id} className="row between">
              <span className="row" style={{ gap: 8 }}>
                <Avatar id={p.avatar} size={30} /> {p.name}
                {isHidden && <span className="pill">🙈 Hidden</span>}
              </span>
              <form action={quickHide}>
                <input type="hidden" name="list_id" value={list.id} />
                <input type="hidden" name="user_id" value={p.id} />
                <input type="hidden" name="action" value={isHidden ? "unhide" : "hide"} />
                <button className={`btn small ${isHidden ? "secondary" : "ghost"}`}>{isHidden ? "Let them see it" : "Hide from them"}</button>
              </form>
            </div>
          );
        })}
      </div>
      <div className="card stack">
        <h2>Guests without an account</h2>
        <p className="small muted" style={{ margin: 0 }}>
          Add someone&apos;s email to make a private link just for them. With editing on, they can add and remove wishes (great for a grandparent helping a kid), and they can mark gifts they bought. They see what&apos;s already bought so nobody doubles up, but not who bought it.
        </p>
        <form action={addGuest} className="row" style={{ alignItems: "flex-end" }}>
          <input type="hidden" name="list_id" value={list.id} />
          <label style={{ flex: 1, minWidth: 200 }}>Email<input name="email" type="email" required placeholder="grandma@example.com" /></label>
          <label className="inline"><input type="checkbox" name="can_edit" defaultChecked /> Can edit</label>
          <button className="btn">Add</button>
        </form>
        {guests.length > 0 && (
          <table className="table">
            <tbody>
              {guests.map((g) => (
                <tr key={g.id}>
                  <td>{g.email}<div className="tiny muted">{g.can_edit ? "Can edit" : "View only"}</div></td>
                  <td style={{ textAlign: "right" }}>
                    <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
                      <CopyButton text={`/s/${g.token}`} label="Copy link" />
                      <form action={removeGuest}>
                        <input type="hidden" name="list_id" value={list.id} />
                        <input type="hidden" name="guest_id" value={g.id} />
                        <button className="btn small danger">Remove</button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
