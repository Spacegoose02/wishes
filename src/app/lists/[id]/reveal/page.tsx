import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getList, isManager } from "@/lib/access";
import { categoryIcon } from "@/lib/categories";
import { revealGifts, revealOpen, STICKERS } from "@/lib/reveal";
import { thankGiver } from "../../../actions/purchases";
import { Flash, type SP } from "@/components/Flash";
import { GiftBox } from "@/components/GiftBox";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "What I got" };

// After the event, the list's people unwrap what they got and send thank-yous.
export default async function RevealPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const user = await requireUser();
  const list = getList(Number((await params).id));
  if (!list || !isManager(user.id, list)) notFound();
  if (!revealOpen(list)) {
    return (
      <div className="narrow-640 card empty mt-24">
        <div className="big" aria-hidden="true">🤫</div>
        No peeking! Come back {list.event_date ? `on ${new Date(list.event_date + "T00:00:00").toLocaleDateString()}` : "after the big day"}.
        <p><Link href={`/lists/${list.id}`}>Back to the list</Link></p>
      </div>
    );
  }
  const gifts = revealGifts(list);
  const sp = await searchParams;
  return (
    <div className="narrow-820">
      <Flash searchParams={searchParams} />
      <p className="small m0"><Link href={`/lists/${list.id}`}>← {list.title}</Link></p>
      <h1>🎁 What {list.profile_is_primary && list.owner_user_id === user.id ? "I" : list.profile_name} got</h1>
      {gifts.length === 0 && <div className="card empty"><div className="big" aria-hidden="true">📦</div>No gifts were marked bought on this list.</div>}
      <div className="grid">
        {gifts.map((g) => {
          const card = (
            <div className="card stack">
              <div className="item-img reveal-img">{g.image_url ? <img src={g.image_url} alt="" referrerPolicy="no-referrer" /> : categoryIcon(g.category)}</div>
              <strong>{g.item_title}</strong>
              <span className="small muted">from {g.buyer_name}</span>
              {g.thanked ? (
                <span className="pill good">{g.thanked} Thanked</span>
              ) : g.buyer_user_id ? (
                <form action={thankGiver} className="stack">
                  <input type="hidden" name="list_id" value={list.id} />
                  <input type="hidden" name="purchase_id" value={g.purchase_id} />
                  <fieldset className="sticker-pick">
                    <legend className="small fw-700">Say thanks</legend>
                    {STICKERS.map((s, i) => (
                      <label key={s}><input type="radio" name="sticker" value={s} defaultChecked={i === 0} /><span>{s}</span></label>
                    ))}
                  </fieldset>
                  <input name="note" maxLength={140} placeholder="I love it!" aria-label="Short note" />
                  <SubmitButton className="btn small">Send thank-you</SubmitButton>
                </form>
              ) : (
                <span className="tiny muted">Thank them in person!</span>
              )}
            </div>
          );
          // Gifts already thanked (or opened after a thank-you) stay unwrapped.
          return g.thanked || sp.ok ? <div key={g.purchase_id}>{card}</div> : <GiftBox key={g.purchase_id} label={g.item_title}>{card}</GiftBox>;
        })}
      </div>
    </div>
  );
}
