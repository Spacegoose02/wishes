import { notFound } from "next/navigation";
import { all, get } from "@/lib/db";
import { getList } from "@/lib/access";
import { formatMoney } from "@/lib/format";
import { categoryIcon } from "@/lib/categories";
import type { Item, Purchase } from "@/lib/types";
import { guestAddItem, guestAutofill, guestDeleteItem, guestRecordPurchase, guestUndoPurchase } from "../../actions/app";
import { ItemForm } from "@/components/ItemForm";
import { Avatar } from "@/components/Avatar";
import { Flash, type SP } from "@/components/Flash";

// Guest view for a whitelisted email: no account needed. Guests see what's already been
// bought (so nobody doubles up) and can mark their own purchases, but not who bought the rest.
export default async function GuestListPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: SP }) {
  const { token } = await params;
  const guest = get<{ list_id: number; email: string; can_edit: number }>("SELECT * FROM list_guests WHERE token = ?", token);
  if (!guest) notFound();
  const list = getList(guest.list_id);
  if (!list) notFound();
  const items = all<Item>("SELECT * FROM items WHERE list_id = ? ORDER BY purchased, priority DESC, created_at DESC", list.id);
  const purchases = all<Purchase>("SELECT * FROM purchases WHERE list_id = ? AND status != 'rejected'", list.id);
  const mine = (p: Purchase) => p.buyer_user_id === null && p.buyer_name.toLowerCase() === guest.email.toLowerCase();
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
        {items.map((it) => {
          const ps = purchases.filter((p) => p.item_id === it.id);
          const bought = ps.reduce((s, p) => s + p.quantity, 0);
          const remaining = Math.max(0, it.quantity - bought);
          const details = [it.variant, it.color && `Color: ${it.color}`, it.size && `Size: ${it.size}`].filter(Boolean);
          return (
            <div key={it.id} id={`item-${it.id}`} className={`card item ${remaining === 0 ? "claimed" : ""}`}>
              <div className="item-img">{it.image_url ? <img src={it.image_url} alt="" referrerPolicy="no-referrer" /> : categoryIcon(it.category)}</div>
              <div>
                {it.url ? <a className="item-title" href={it.url} target="_blank" rel="noopener noreferrer nofollow">{it.title}</a> : <span className="item-title">{it.title}</span>}
                <div className="row" style={{ gap: 8 }}>
                  {it.price_cents ? <span className="item-price">{formatMoney(it.price_cents)}</span> : null}
                  {it.store && <span className="pill">{it.store}</span>}
                  <span className="stars">{"★".repeat(it.priority)}</span>
                  {it.quantity > 1 && <span className="pill">×{it.quantity}</span>}
                </div>
                {details.length > 0 && <p className="small" style={{ margin: "6px 0 0", fontWeight: 600 }}>{details.join(" · ")}</p>}
                {it.notes && <p className="small muted" style={{ margin: "4px 0 0" }}>{it.notes}</p>}
                <div className="small" style={{ margin: "6px 0 0", fontWeight: 700, color: "var(--good)" }}>
                  {ps.filter(mine).map((p) => (
                    <div key={p.id}>
                      {p.status === "pending" ? "⏳" : "✅"} You bought {p.quantity > 1 ? `${p.quantity} ` : ""}{p.price_cents ? `for ${formatMoney(p.price_cents)}` : ""}
                      {p.status === "pending" && <span className="muted"> (waiting for review)</span>}
                      <form action={guestUndoPurchase} style={{ display: "inline" }}>
                        <input type="hidden" name="token" value={token} />
                        <input type="hidden" name="purchase_id" value={p.id} />
                        <button className="linkish">undo</button>
                      </form>
                    </div>
                  ))}
                  {ps.some((p) => !mine(p)) && <div>✅ {remaining === 0 ? "Already bought" : `${bought} of ${it.quantity} already bought`}</div>}
                  {!ps.length && it.claimed_by ? <div>🎀 Someone is getting this</div> : null}
                </div>
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
              {remaining > 0 && (
                <details className="buy" style={{ gridColumn: "1 / -1" }}>
                  <summary className="small" style={{ cursor: "pointer", fontWeight: 700, color: "var(--accent)" }}>🛍️ I bought this</summary>
                  <form action={guestRecordPurchase} className="form-grid" style={{ marginTop: 10 }}>
                    <input type="hidden" name="token" value={token} />
                    <input type="hidden" name="item_id" value={it.id} />
                    {it.quantity > 1 && <label>How many?<input name="quantity" type="number" min={1} max={remaining} defaultValue={remaining} /></label>}
                    <label>Price paid<input name="price" inputMode="decimal" defaultValue={it.price_cents ? (it.price_cents / 100).toFixed(2) : ""} /></label>
                    <label>Where<input name="store" defaultValue={it.store} /></label>
                    <label className="full">Note (optional)<input name="note" /></label>
                    <button className="btn small">Save purchase</button>
                    {list.review_purchases ? <p className="tiny muted full" style={{ margin: 0 }}>A list manager will confirm this purchase.</p> : null}
                  </form>
                </details>
              )}
            </div>
          );
        })}
        {items.length === 0 && <div className="card empty"><div className="big">🪿</div>No wishes yet.</div>}
      </div>
    </div>
  );
}
