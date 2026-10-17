import { notFound } from "next/navigation";
import { all, get } from "@/lib/db";
import { getList } from "@/lib/access";
import { formatMoney } from "@/lib/format";
import type { Item } from "@/lib/types";
import { guestAddItem, guestAutofill, guestDeleteItem } from "../../actions/app";
import { ItemForm } from "@/components/ItemForm";
import { Avatar } from "@/components/Avatar";
import { Flash, type SP } from "@/components/Flash";

// Guest view for a whitelisted email: no account, no claim info.
export default async function GuestListPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: SP }) {
  const { token } = await params;
  const guest = get<{ list_id: number; email: string; can_edit: number }>("SELECT * FROM list_guests WHERE token = ?", token);
  if (!guest) notFound();
  const list = getList(guest.list_id);
  if (!list) notFound();
  const items = all<Item>("SELECT * FROM items WHERE list_id = ? ORDER BY priority DESC, created_at DESC", list.id);
  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <div className="row" style={{ marginTop: 8 }}>
        <span style={{ fontSize: "2.6rem" }}>{list.emoji}</span>
        <div>
          <h1 style={{ margin: 0 }}>{list.title}</h1>
          <span className="row" style={{ gap: 6 }}><Avatar id={list.profile_avatar} size={24} /><span className="small muted">{list.profile_name}&apos;s list · signed in as guest {guest.email}</span></span>
        </div>
      </div>
      <Flash searchParams={searchParams} />
      {guest.can_edit ? (
        <details className="card" style={{ marginTop: 16 }} open={items.length === 0}>
          <summary>Add a wish</summary>
          <ItemForm action={guestAddItem} autofill={guestAutofill.bind(null, token)} hidden={{ token }} />
        </details>
      ) : null}
      <div className="items section">
        {items.map((it) => (
          <div key={it.id} className="card item">
            <div className="item-img">{it.image_url ? <img src={it.image_url} alt="" referrerPolicy="no-referrer" /> : "🎁"}</div>
            <div>
              {it.url ? <a className="item-title" href={it.url} target="_blank" rel="noopener noreferrer nofollow">{it.title}</a> : <span className="item-title">{it.title}</span>}
              <div className="row" style={{ gap: 8 }}>
                {it.price_cents ? <span className="item-price">{formatMoney(it.price_cents)}</span> : null}
                {it.store && <span className="pill">{it.store}</span>}
                <span className="stars">{"★".repeat(it.priority)}</span>
              </div>
              {it.notes && <p className="small muted" style={{ margin: "6px 0 0" }}>{it.notes}</p>}
            </div>
            <div className="item-actions">
              {guest.can_edit ? (
                <form action={guestDeleteItem}>
                  <input type="hidden" name="token" value={token} />
                  <input type="hidden" name="item_id" value={it.id} />
                  <button className="btn small danger">Remove</button>
                </form>
              ) : null}
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="card empty"><div className="big">🪿</div>No wishes yet.</div>}
      </div>
    </div>
  );
}
