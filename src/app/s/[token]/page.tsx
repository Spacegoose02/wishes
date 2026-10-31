import { notFound } from "next/navigation";
import { all, get } from "@/lib/db";
import { getList } from "@/lib/access";
import { formatMoney } from "@/lib/format";
import { categoryIcon } from "@/lib/categories";
import type { Item, Purchase } from "@/lib/types";
import { guestAddItem, guestAutofill, guestDeleteItem, guestRecordPurchase, guestUndoPurchase } from "../../actions/guests";
import { ItemForm } from "@/components/ItemForm";
import { Avatar } from "@/components/Avatar";
import { Flash, type SP } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { Confetti } from "@/components/Confetti";

export const metadata = { title: "Shared list" };

// Guest view for a whitelisted email: no account needed. Guests see what's already been
// bought (so nobody doubles up) and can mark their own purchases, but not who bought the rest.
export default async function GuestListPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: SP }) {
  const { token } = await params;
  const guest = get<{ list_id: number; email: string; can_edit: number }>("SELECT * FROM list_guests WHERE token = ?", token);
  if (!guest) notFound();
  const list = getList(guest.list_id);
  if (!list) notFound();
  const items = all<Item>("SELECT * FROM items WHERE list_id = ? AND needs_approval = 0 ORDER BY purchased, must_have DESC, priority DESC, created_at DESC", list.id);
  const purchases = all<Purchase>("SELECT * FROM purchases WHERE list_id = ? AND status != 'rejected'", list.id);
  const mine = (p: Purchase) => p.buyer_user_id === null && p.buyer_name.toLowerCase() === guest.email.toLowerCase();
  return (
    <div className="narrow-820">
      <div className="row mt-8">
        <span style={{ fontSize: "2.6rem" }}>{list.emoji}</span>
        <div>
          <h1 className="m0">{list.title}</h1>
          <span className="row gap-6"><Avatar id={list.profile_avatar} size={24} /><span className="small muted">{list.profile_name}&apos;s list · signed in as guest {guest.email}</span></span>
        </div>
      </div>
      <Flash searchParams={searchParams} />
      {(await searchParams).ok === "Added" && <Confetti />}
      {guest.can_edit ? (
        <details className="card mt-16" open={items.length === 0}>
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
                <div className="row gap-8">
                  {it.must_have ? <span className="pill must">⭐ Must-have</span> : null}
                  {it.price_cents ? <span className="item-price">{formatMoney(it.price_cents)}</span> : null}
                  {it.store && <span className="pill">{it.store}</span>}
                  <span className="stars" role="img" aria-label={`Wanted ${it.priority} of 3`}>{"★".repeat(it.priority)}</span>
                  {it.quantity > 1 && <span className="pill">×{it.quantity}</span>}
                </div>
                {details.length > 0 && <p className="small m0 mt-6 fw-600">{details.join(" · ")}</p>}
                {it.notes && <p className="small muted m0 mt-4">{it.notes}</p>}
                <div className="small m0 mt-6 fw-700 text-good">
                  {ps.filter(mine).map((p) => (
                    <div key={p.id}>
                      {p.status === "pending" ? "⏳" : "✅"} You bought {p.quantity > 1 ? `${p.quantity} ` : ""}{p.price_cents ? `for ${formatMoney(p.price_cents)}` : ""}
                      {p.status === "pending" && <span className="muted"> (waiting for review)</span>}
                      <form action={guestUndoPurchase} className="inline-form">
                        <input type="hidden" name="token" value={token} />
                        <input type="hidden" name="purchase_id" value={p.id} />
                        <SubmitButton className="linkish">undo</SubmitButton>
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
                    <SubmitButton className="btn small danger" confirm="Remove wish?">Remove</SubmitButton>
                  </form>
                ) : null}
              </div>
              {remaining > 0 && (
                <details className="buy full">
                  <summary className="small pointer fw-700 text-accent">🛍️ I bought this</summary>
                  <form action={guestRecordPurchase} className="form-grid mt-10">
                    <input type="hidden" name="token" value={token} />
                    <input type="hidden" name="item_id" value={it.id} />
                    {it.quantity > 1 && <label>How many?<input name="quantity" type="number" min={1} max={remaining} defaultValue={remaining} /></label>}
                    <label>Price paid<input name="price" inputMode="decimal" defaultValue={it.price_cents ? (it.price_cents / 100).toFixed(2) : ""} /></label>
                    <label>Where<input name="store" defaultValue={it.store} /></label>
                    <label className="full">Note (optional)<input name="note" /></label>
                    <SubmitButton className="btn small">Save purchase</SubmitButton>
                    {list.review_purchases ? <p className="tiny muted full m0">A list manager will confirm this purchase.</p> : null}
                  </form>
                </details>
              )}
            </div>
          );
        })}
        {items.length === 0 && <div className="card empty"><div className="big" aria-hidden="true">🪿</div>No wishes yet.</div>}
      </div>
    </div>
  );
}
