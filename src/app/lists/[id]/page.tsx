import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getList, listAccess, ownerSeesClaims } from "@/lib/access";
import { all, get } from "@/lib/db";
import { aiEnabled } from "@/lib/ai";
import { daysUntil, formatMoney } from "@/lib/format";
import type { Item } from "@/lib/types";
import { addItem, autofill, claimItem, deleteItem, refreshItem, updateItem } from "../../actions/app";
import { ItemForm } from "@/components/ItemForm";
import { Avatar } from "@/components/Avatar";
import { Flash, type SP } from "@/components/Flash";

type Params = Promise<{ id: string }>;

function Hidden({ item, action }: { item: number; action?: string }) {
  return (
    <>
      <input type="hidden" name="item_id" value={item} />
      {action && <input type="hidden" name="action" value={action} />}
    </>
  );
}

export default async function ListPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const user = await requireUser();
  const list = getList(Number((await params).id));
  if (!list) notFound();
  const access = listAccess(user, list);
  if (access === "none") notFound();
  const owner = access === "owner";
  const showClaims = !owner || ownerSeesClaims(list);
  const items = all<Item>("SELECT * FROM items WHERE list_id = ? ORDER BY purchased, priority DESC, created_at DESC", list.id);
  const pending = owner ? get<{ n: number }>("SELECT COUNT(*) AS n FROM suggestions WHERE list_id = ? AND status = 'pending'", list.id)!.n : 0;
  const days = daysUntil(list.event_date);
  const total = items.reduce((sum, i) => sum + (i.price_cents ?? 0) * i.quantity, 0);

  return (
    <>
      <Flash searchParams={searchParams} />
      <div className="section-head" style={{ marginTop: 8 }}>
        <div className="row" style={{ alignItems: "flex-start" }}>
          <span style={{ fontSize: "2.6rem", lineHeight: 1 }}>{list.emoji}</span>
          <div>
            <h1 style={{ marginBottom: 4 }}>{list.title}</h1>
            <div className="row" style={{ gap: 6 }}>
              <span className="row" style={{ gap: 6 }}>
                <Avatar id={list.profile_avatar} size={24} />
                <span className="small" style={{ fontWeight: 700 }}>{list.profile_name}</span>
              </span>
              {list.occasion && <span className="pill accent">{list.occasion}</span>}
              {days !== undefined && days >= 0 && <span className="pill good">{days === 0 ? "Today!" : `${days} days to go`}</span>}
              {owner && list.visibility === "private" && <span className="pill">🔒 Hidden</span>}
            </div>
          </div>
        </div>
        {owner && (
          <div className="row" style={{ gap: 6 }}>
            {aiEnabled() && (
              <Link href={`/lists/${list.id}/ideas`} className="btn small secondary">
                ✨ Ideas{pending > 0 && <span className="badge">{pending}</span>}
              </Link>
            )}
            <Link href={`/lists/${list.id}/share`} className="btn small secondary">Share</Link>
            <Link href={`/lists/${list.id}/edit`} className="btn small ghost">Edit</Link>
          </div>
        )}
      </div>
      {list.description && <p className="muted">{list.description}</p>}

      {owner && (
        <details className="card" open={items.length === 0} style={{ marginTop: 12 }}>
          <summary>Add a wish</summary>
          <ItemForm action={addItem} autofill={autofill} hidden={{ list_id: list.id }} />
        </details>
      )}

      <section className="section">
        <div className="section-head">
          <h2 style={{ margin: 0 }}>{items.length} {items.length === 1 ? "wish" : "wishes"}</h2>
          {total > 0 && <span className="muted small">About {formatMoney(total)} total</span>}
        </div>
        {items.length === 0 && (
          <div className="card empty"><div className="big">🌟</div>{owner ? "Paste a link above to add your first wish." : "Nothing here yet."}</div>
        )}
        <div className="items">
          {items.map((it) => {
            const claimedByMe = it.claimed_by === user.id;
            const claimed = showClaims && !!it.claimed_by;
            return (
              <div key={it.id} id={`item-${it.id}`} className={`card item ${claimed && !claimedByMe ? "claimed" : ""}`}>
                <div className="item-img">
                  {it.image_url ? <img src={it.image_url} alt="" referrerPolicy="no-referrer" loading="lazy" /> : "🎁"}
                </div>
                <div style={{ minWidth: 0 }}>
                  {it.url ? (
                    <a className="item-title" href={it.url} target="_blank" rel="noopener noreferrer nofollow">{it.title}</a>
                  ) : (
                    <span className="item-title">{it.title}</span>
                  )}
                  <div className="row" style={{ gap: 8, marginTop: 2 }}>
                    {it.price_cents ? <span className="item-price">{formatMoney(it.price_cents, it.currency)}</span> : null}
                    {it.store && <span className="pill">{it.store}</span>}
                    <span className="stars" title="How much they want it">{"★".repeat(it.priority)}</span>
                    {it.quantity > 1 && <span className="pill">×{it.quantity}</span>}
                  </div>
                  {it.notes && <p className="small muted" style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{it.notes}</p>}
                  {claimed && (
                    <p className="small" style={{ margin: "6px 0 0", fontWeight: 700, color: "var(--good)" }}>
                      {claimedByMe
                        ? it.purchased ? "✅ You bought this" : "🎀 You're getting this"
                        : `🎀 ${it.claimed_name ?? "Someone"} is getting this${it.purchased ? " (bought)" : ""}`}
                    </p>
                  )}
                  {it.created_by_guest && owner && <p className="tiny muted" style={{ margin: "4px 0 0" }}>Added by {it.created_by_guest}</p>}
                </div>
                <div className="item-actions">
                  {!owner && !it.claimed_by && (
                    <form action={claimItem}><Hidden item={it.id} action="claim" /><button className="btn small">I&apos;ll get it</button></form>
                  )}
                  {claimedByMe && (
                    <>
                      <form action={claimItem}><Hidden item={it.id} action="purchased" /><button className="btn small secondary">{it.purchased ? "Not bought" : "Mark bought"}</button></form>
                      <form action={claimItem}><Hidden item={it.id} action="unclaim" /><button className="btn small ghost">Unclaim</button></form>
                    </>
                  )}
                  {it.url && (
                    <form action={refreshItem}><Hidden item={it.id} /><button className="btn small ghost" title="Check the current price">↻ Price</button></form>
                  )}
                  {owner && (
                    <form action={deleteItem}><Hidden item={it.id} /><button className="btn small danger">Remove</button></form>
                  )}
                </div>
                {owner && (
                  <details style={{ gridColumn: "1 / -1" }}>
                    <summary className="small muted" style={{ cursor: "pointer" }}>Edit</summary>
                    <div style={{ marginTop: 10 }}>
                      <ItemForm
                        action={updateItem}
                        autofill={autofill}
                        hidden={{ item_id: it.id }}
                        submitLabel="Save changes"
                        defaults={{
                          title: it.title, url: it.url, store: it.store,
                          price: it.price_cents ? (it.price_cents / 100).toFixed(2) : "",
                          image_url: it.image_url, notes: it.notes, priority: it.priority, quantity: it.quantity,
                        }}
                      />
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
