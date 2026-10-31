import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getUser, requireUser } from "@/lib/auth";
import { canEditProfile, getList, isRecipient, listAccess, myLists } from "@/lib/access";
import { AboutProfile } from "@/components/AboutProfile";
import { RenameKid } from "@/components/RenameKid";
import { all, get } from "@/lib/db";
import { aiEnabled } from "@/lib/ai";
import { daysUntil, formatMoney } from "@/lib/format";
import { CATEGORIES, categoryIcon, categoryLabel } from "@/lib/categories";
import type { Item, Profile, Purchase } from "@/lib/types";
import { watchesFor } from "@/lib/watches";
import { addItem, approveWish, archiveItem, bulkAddItems, watchPrice, autofill, claimItem, compareStores, deleteItem, moveItem, refreshItem, toggleMustHave, updateItem } from "../../actions/items";
import { MAX_MUST_HAVES } from "@/lib/wishes";
import { isFund, kindInfo } from "@/lib/kinds";
import { pledgeToItem, recordPurchase, undoPurchase } from "../../actions/purchases";
import { revealOpen } from "@/lib/reveal";
import { pledgeGoal, pledgeProgress, pledgesForList, type Pledge } from "@/lib/pledges";
import { ItemForm } from "@/components/ItemForm";
import { Avatar } from "@/components/Avatar";
import { Flash, type SP } from "@/components/Flash";
import { ClaimButton } from "@/components/ClaimButton";
import { Menu } from "@/components/Menu";
import { SubmitButton } from "@/components/SubmitButton";
import { Confetti } from "@/components/Confetti";

type Params = Promise<{ id: string }>;

const SORTS = {
  priority: "Most wanted",
  newest: "Newest",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  name: "Name",
  category: "Category",
} as const;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const user = await getUser();
  const list = user ? getList(Number((await params).id)) : undefined;
  if (!user || !list || listAccess(user, list) === "none") return { title: "List" };
  return { title: list.profile_is_primary && list.owner_user_id === user.id ? list.title : `${list.title} (${list.profile_name})` };
}

function Hidden({ item, action }: { item: number; action?: string }) {
  return (
    <>
      <input type="hidden" name="item_id" value={item} />
      {action && <input type="hidden" name="action" value={action} />}
    </>
  );
}

// Chip-in progress toward one wish, for shoppers only.
function GroupGift({ item, pledges, userId }: { item: Item; pledges: Pledge[]; userId: number }) {
  const p = pledgeProgress(pledgeGoal(item), pledges);
  const mine = pledges.find((x) => x.user_id === userId);
  return (
    <details className="buy full" open={pledges.length > 0 || isFund(item.kind)}>
      <summary className="small pointer fw-700 text-accent">{isFund(item.kind) ? "🏦 Chip in" : "🤝 Group gift"}{pledges.length > 0 && `: ${formatMoney(p.total)} of ${formatMoney(p.goal)}`}</summary>
      <div className="progress mt-6" role="progressbar" aria-valuenow={p.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Chipped in so far">
        <span style={{ width: `${p.pct}%` }} />
      </div>
      {pledges.length > 0 && (
        <p className="tiny muted m0 mt-4">
          {pledges.map((x) => `${x.user_id === userId ? "You" : x.name} ${formatMoney(x.amount_cents)}`).join(" · ")}
          {p.full ? " · Fully funded! 🎉" : ` · ${formatMoney(p.remaining)} to go`}
        </p>
      )}
      {(!p.full || mine) && (
        <form action={pledgeToItem} className="row mt-8 items-end">
          <Hidden item={item.id} />
          <label className="grow min-180">{mine ? "Change your pledge (0 to withdraw)" : "Chip in"}
            <input name="amount" inputMode="decimal" defaultValue={mine ? (mine.amount_cents / 100).toFixed(2) : ""} placeholder={(Math.min(p.remaining, 2000) / 100).toFixed(2)} />
          </label>
          <SubmitButton className="btn small secondary">{mine ? "Update" : "Pledge"}</SubmitButton>
        </form>
      )}
    </details>
  );
}

function ago(ts: number | null): string {
  if (!ts) return "";
  const mins = Math.round((Date.now() / 1000 - ts) / 60);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

export default async function ListPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  const user = await requireUser();
  const list = getList(Number((await params).id));
  if (!list) notFound();
  const access = listAccess(user, list);
  if (access === "none") notFound();
  const owner = access === "owner";
  const recipient = isRecipient(user.id, list);
  const profile = get<Profile>("SELECT * FROM profiles WHERE id = ?", list.profile_id);
  const otherLists = owner ? myLists(user.id).filter((l) => l.id !== list.id) : [];
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const cat = typeof sp.cat === "string" ? sp.cat : "";
  const status = !recipient && typeof sp.status === "string" ? sp.status : "";
  const sort = (typeof sp.sort === "string" && sp.sort in SORTS ? sp.sort : "priority") as keyof typeof SORTS;
  const maxPrice = Number(sp.max) || 0;
  const must = sp.must === "1";
  const board = sp.view === "board";
  // A link shared into the app (see /share) opens the add form already filled in.
  const shared = owner && typeof sp.add === "string" ? sp.add : "";

  // Kid-mode wishes stay with the list's managers until one of them approves.
  const allItems = all<Item>("SELECT * FROM items WHERE list_id = ? AND archived_at IS NULL ORDER BY purchased, priority DESC, created_at DESC", list.id)
    .filter((i) => owner || !i.needs_approval);
  // The list's own person only sees what they marked themselves.
  const purchases = recipient
    ? all<Purchase>("SELECT * FROM purchases WHERE list_id = ? AND buyer_user_id = ? ORDER BY created_at", list.id, user.id)
    : all<Purchase>("SELECT * FROM purchases WHERE list_id = ? AND status != 'rejected' ORDER BY created_at", list.id);
  const offerRows = all<{ item_id: number; store: string; title: string; url: string; price_cents: number; ai_checked: number }>(
    "SELECT o.* FROM offers o JOIN items i ON i.id = o.item_id WHERE i.list_id = ? ORDER BY o.price_cents", list.id,
  );
  const offersByItem = new Map<number, typeof offerRows>();
  for (const o of offerRows) offersByItem.set(o.item_id, [...(offersByItem.get(o.item_id) ?? []), o]);
  // Pledges are for shoppers; the list's own person never sees them.
  const pledges = recipient ? [] : pledgesForList(list.id);
  const watches = watchesFor(user.id, list.id);
  const byItem = new Map<number, Purchase[]>();
  for (const p of purchases) if (p.item_id) byItem.set(p.item_id, [...(byItem.get(p.item_id) ?? []), p]);

  let items = allItems.filter((it) => {
    if (q && !`${it.title} ${it.store} ${it.notes} ${it.color} ${it.variant}`.toLowerCase().includes(q)) return false;
    if (cat && it.category !== cat) return false;
    if (must && !it.must_have) return false;
    if (maxPrice && (it.price_cents ?? 0) > maxPrice * 100) return false;
    if (status === "available") return !it.claimed_by && !it.purchased;
    if (status === "claimed") return !!it.claimed_by && !it.purchased;
    if (status === "bought") return !!it.purchased;
    return true;
  });
  const cmp: Record<keyof typeof SORTS, (a: Item, b: Item) => number> = {
    priority: (a, b) => b.must_have - a.must_have || b.priority - a.priority || b.created_at - a.created_at,
    newest: (a, b) => b.created_at - a.created_at,
    "price-asc": (a, b) => (a.price_cents ?? 1e12) - (b.price_cents ?? 1e12),
    "price-desc": (a, b) => (b.price_cents ?? -1) - (a.price_cents ?? -1),
    name: (a, b) => a.title.localeCompare(b.title),
    category: (a, b) => categoryLabel(a.category || "other").localeCompare(categoryLabel(b.category || "other")) || b.priority - a.priority,
  };
  items = [...items].sort(cmp[sort]);
  // Bought things sink to the bottom for shoppers.
  if (!recipient) items.sort((a, b) => a.purchased - b.purchased);

  const usedCats = CATEGORIES.filter((c) => allItems.some((i) => i.category === c.id));
  const pastCount = get<{ n: number }>("SELECT COUNT(*) AS n FROM items WHERE list_id = ? AND archived_at IS NOT NULL AND needs_approval = 0", list.id)!.n;
  const pendingIdeas = owner ? get<{ n: number }>("SELECT COUNT(*) AS n FROM suggestions WHERE list_id = ? AND status = 'pending'", list.id)!.n : 0;
  const pendingReviews = owner && !recipient ? purchases.filter((p) => p.status === "pending").length : 0;
  const days = daysUntil(list.event_date);
  const total = items.reduce((sum, i) => sum + (i.price_cents ?? 0) * i.quantity, 0);
  const filtered = q || cat || status || maxPrice || must;
  const mustCount = allItems.filter((i) => i.must_have).length;
  const groups = sort === "category"
    ? [...new Set(items.map((i) => i.category || "other"))].map((c) => ({ key: c, items: items.filter((i) => (i.category || "other") === c) }))
    : [{ key: "", items }];

  return (
    <>
      <Flash searchParams={searchParams} />
      {days === 0 ? <Confetti kind="event" /> : sp.ok === "Added" ? <Confetti /> : null}
      <div className="section-head mt-8">
        <div className="row items-start">
          <span style={{ fontSize: "2.6rem", lineHeight: 1 }} aria-hidden="true">{list.emoji}</span>
          <div>
            <h1 className="mb-4">{list.title}</h1>
            <div className="row gap-6">
              <span className="row gap-6">
                <Avatar id={list.profile_avatar} size={24} />
                <span className="small fw-700">{list.profile_name}</span>
                {profile && !profile.is_primary && canEditProfile(user.id, profile) && (
                  <RenameKid id={profile.id} name={profile.name} back={`/lists/${list.id}`} />
                )}
              </span>
              {list.occasion && <span className="pill accent">{list.occasion}</span>}
              {days !== undefined && days >= 0 && <span className="pill good">{days === 0 ? "Today!" : `${days} days to go`}</span>}
              {owner && list.visibility === "private" && <span className="pill">🔒 Hidden</span>}
              {owner && list.review_purchases ? <span className="pill">🧾 Purchases reviewed</span> : null}
            </div>
          </div>
        </div>
        <div className="row gap-6">
          {!recipient && (
            <Link href={`/lists/${list.id}/purchases`} className="btn small secondary">
              🧾 Purchases{pendingReviews > 0 && <span className="badge">{pendingReviews}</span>}
            </Link>
          )}
          {owner && revealOpen(list) && <Link href={`/lists/${list.id}/reveal`} className="btn small">🎁 What {recipient ? "I" : "they"} got</Link>}
          {aiEnabled() && <Link href={`/chat?list=${list.id}`} className="btn small">🦝 Ask Bandit</Link>}
          {owner && aiEnabled() && (
            <Link href={`/lists/${list.id}/ideas`} className="btn small secondary">
              ✨ Ideas{pendingIdeas > 0 && <span className="badge">{pendingIdeas}</span>}
            </Link>
          )}
          <Link href={`/lists/${list.id}/print`} className="btn small ghost">🖨️ Print</Link>
          {pastCount > 0 && <Link href={`/lists/${list.id}/archive`} className="btn small ghost">🗃️ Past gifts ({pastCount})</Link>}
          {owner && <Link href={`/lists/${list.id}/share`} className="btn small secondary">Share &amp; hide</Link>}
          {owner && <Link href={`/lists/${list.id}/edit`} className="btn small ghost">Edit</Link>}
        </div>
      </div>
      {list.description && <p className="muted">{list.description}</p>}
      {profile && <AboutProfile p={profile} editHref={canEditProfile(user.id, profile) ? (profile.is_primary ? "/settings?tab=me" : `/settings?tab=profiles&edit=${profile.id}#profile-${profile.id}`) : undefined} />}

      {owner && (
        <details className="card mt-12" open={allItems.length === 0 || !!shared}>
          <summary>Add a wish</summary>
          <ItemForm action={addItem} autofill={autofill} hidden={{ list_id: list.id }} defaults={shared ? { url: shared } : undefined} autoFetch={!!shared} />
          <details className="mt-12">
            <summary className="small pointer fw-700">📋 Paste many links at once</summary>
            <form action={bulkAddItems} className="stack mt-10">
              <input type="hidden" name="list_id" value={list.id} />
              <label>One link per line (up to 15), or paste a whole message with links in it
                <textarea name="links" rows={5} required placeholder={"https://www.amazon.com/...\nhttps://www.target.com/..."} />
              </label>
              <SubmitButton className="btn secondary" pendingLabel="Looking them up…">Add them all</SubmitButton>
            </form>
          </details>
        </details>
      )}

      {allItems.length > 0 && (
        <form className="card filters" method="get">
          {must && <input type="hidden" name="must" value="1" />}
          {board && <input type="hidden" name="view" value="board" />}
          <input name="q" defaultValue={q} placeholder="Search this list" aria-label="Search" />
          <select name="cat" defaultValue={cat} aria-label="Category">
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
          </select>
          {!recipient && (
            <select name="status" defaultValue={status} aria-label="Status">
              <option value="">Any status</option>
              <option value="available">Still available</option>
              <option value="claimed">Someone&apos;s getting it</option>
              <option value="bought">Already bought</option>
            </select>
          )}
          <input name="max" type="number" min={0} defaultValue={maxPrice || ""} placeholder="Max $" aria-label="Max price" />
          <select name="sort" defaultValue={sort} aria-label="Sort">
            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn small">Apply</button>
          {filtered ? <Link href={`/lists/${list.id}`} className="btn small ghost">Clear</Link> : null}
        </form>
      )}
      {mustCount > 0 && (
        <div className="row chips gap-6 mt-10">
          <Link href={must ? `/lists/${list.id}?sort=${sort}` : `/lists/${list.id}?must=1&sort=${sort}`} className={`pill must ${must ? "accent" : ""}`} aria-pressed={must}>
            ⭐ Must-haves only ({mustCount})
          </Link>
        </div>
      )}
      {usedCats.length > 1 && (
        <div className="row chips gap-6 mt-10">
          <Link href={`/lists/${list.id}?sort=${sort}`} className={`pill ${!cat ? "accent" : ""}`}>All</Link>
          {usedCats.map((c) => (
            <Link key={c.id} href={`/lists/${list.id}?cat=${c.id}&sort=${sort}`} className={`pill ${cat === c.id ? "accent" : ""}`}>
              {c.icon} {c.label} ({allItems.filter((i) => i.category === c.id).length})
            </Link>
          ))}
        </div>
      )}

      <section className="section">
        <div className="section-head">
          <h2 className="m0">
            {items.length} {items.length === 1 ? "wish" : "wishes"}{filtered ? ` of ${allItems.length}` : ""}
          </h2>
          <div className="row gap-6">
            {total > 0 && <span className="muted small">About {formatMoney(total)} total</span>}
            {allItems.length > 0 && (
              <div className="seg" role="group" aria-label="View">
                <Link href={`/lists/${list.id}?${new URLSearchParams({ ...(q && { q }), ...(cat && { cat }), ...(must && { must: "1" }), sort })}`} aria-current={!board || undefined}>☰ List</Link>
                <Link href={`/lists/${list.id}?${new URLSearchParams({ ...(q && { q }), ...(cat && { cat }), ...(must && { must: "1" }), sort, view: "board" })}`} aria-current={board || undefined}>🖼️ Dream board</Link>
              </div>
            )}
          </div>
        </div>
        {allItems.length === 0 && (
          <div className="card empty"><div className="big" aria-hidden="true">🌟</div>{owner ? "Paste a link above to add your first wish." : "Nothing here yet."}</div>
        )}
        {allItems.length > 0 && items.length === 0 && <div className="card empty">Nothing matches those filters.</div>}
        {board ? (
          <div className="board">
            {items.map((it) => (
              <a key={it.id} href={`/lists/${list.id}?sort=${sort}#item-${it.id}`} className={`board-tile${!recipient && it.purchased ? " claimed" : ""}`}>
                {it.image_url ? <img src={it.image_url} alt="" referrerPolicy="no-referrer" loading="lazy" /> : <span className="board-icon" aria-hidden="true">{categoryIcon(it.category)}</span>}
                <span className="board-cap">{it.must_have ? "⭐ " : ""}{it.title}{it.price_cents ? ` · ${formatMoney(it.price_cents, it.currency)}` : ""}</span>
              </a>
            ))}
          </div>
        ) : groups.map((g) => (
          <div key={g.key || "all"} className="stack" style={{ marginBottom: 18 }}>
            {g.key && <h3 className="m0 mt-6">{categoryIcon(g.key)} {categoryLabel(g.key)}</h3>}
            <div className="items">
              {g.items.map((it) => {
                const claimedByMe = it.claimed_by === user.id;
                const showClaims = !recipient;
                const claimed = showClaims && !!it.claimed_by;
                const ps = byItem.get(it.id) ?? [];
                const boughtQty = ps.reduce((s, p) => s + p.quantity, 0);
                const remaining = Math.max(0, it.quantity - boughtQty);
                const offers = offersByItem.get(it.id) ?? [];
                const cheaper = it.price_cents ? offers.find((o) => o.price_cents < it.price_cents! * 0.97) : undefined;
                const details = [it.variant, it.color && `Color: ${it.color}`, it.size && `Size: ${it.size}`].filter(Boolean);
                return (
                  <div key={it.id} id={`item-${it.id}`} className={`card item ${showClaims && it.purchased ? "claimed" : ""}`}>
                    <div className="item-img">
                      {it.image_url ? <img src={it.image_url} alt="" referrerPolicy="no-referrer" loading="lazy" /> : categoryIcon(it.category)}
                    </div>
                    <div className="min-0">
                      {it.url ? (
                        <a className="item-title" href={it.url} target="_blank" rel="noopener noreferrer nofollow">{it.title}</a>
                      ) : (
                        <span className="item-title">{it.title}</span>
                      )}
                      <div className="row gap-8" style={{ marginTop: 2 }}>
                        {it.needs_approval ? <span className="pill accent">🧒 Waiting for approval</span> : null}
                        {it.must_have ? <span className="pill must">⭐ Must-have</span> : null}
                        {it.kind !== "product" && <span className="pill accent">{kindInfo(it.kind).icon} {kindInfo(it.kind).label}</span>}
                        {it.price_cents ? <span className="item-price">{formatMoney(it.price_cents, it.currency)}</span> : null}
                        {it.store && <span className="pill">{it.store}</span>}
                        {it.category && <span className="pill">{categoryIcon(it.category)} {categoryLabel(it.category)}</span>}
                        <span className="stars" title="How much they want it" role="img" aria-label={`Wanted ${it.priority} of 3`}>{"★".repeat(it.priority)}</span>
                        {it.quantity > 1 && <span className="pill">×{it.quantity}</span>}
                      </div>
                      {details.length > 0 && <p className="small m0 mt-6 fw-600">{details.join(" · ")}</p>}
                      {it.notes && <p className="small muted m0 mt-4" style={{ whiteSpace: "pre-wrap" }}>{it.notes}</p>}
                      {(claimed || ps.length > 0) && (
                        <div className="small m0 mt-6 fw-700 text-good">
                          {ps.map((p) => (
                            <div key={p.id}>
                              {p.status === "pending" ? "⏳" : "✅"} {p.buyer_user_id === user.id ? "You" : p.buyer_name} bought {p.quantity > 1 ? `${p.quantity} ` : ""}
                              {p.price_cents ? `for ${formatMoney(p.price_cents)}` : ""}{p.store ? ` at ${p.store}` : ""}
                              {p.status === "pending" && <span className="muted"> (waiting for review)</span>}
                              {p.buyer_user_id === user.id && (
                                <form action={undoPurchase} className="inline-form">
                                  <input type="hidden" name="purchase_id" value={p.id} />
                                  <SubmitButton className="linkish">undo</SubmitButton>
                                </form>
                              )}
                            </div>
                          ))}
                          {claimed && !it.purchased && <div>🎀 {claimedByMe ? "You're getting this" : `${it.claimed_name ?? "Someone"} is getting this`}</div>}
                        </div>
                      )}
                      {it.created_by_guest && owner && <p className="tiny muted m0 mt-4">Added by {it.created_by_guest}</p>}
                      {offers.length > 0 && (
                        <div className="offers">
                          {cheaper && <span className="pill good">💰 {formatMoney(it.price_cents! - cheaper.price_cents)} cheaper at {cheaper.store}</span>}
                          {offers.map((o) => (
                            <a key={o.url} href={o.url} target="_blank" rel="noopener noreferrer nofollow" className="offer" title={o.title}>
                              {o.store} <strong>{formatMoney(o.price_cents)}</strong> ↗
                            </a>
                          ))}
                          <span className="tiny muted">{offers[0].ai_checked ? "Matches confirmed by AI." : "Close matches; check it's the same item."}</span>
                        </div>
                      )}
                      {it.url && it.price_checked_at ? <p className="tiny muted m0 mt-4">Price checked {ago(it.price_checked_at)}{it.offers_checked_at ? `, stores compared ${ago(it.offers_checked_at)}` : ""}</p> : null}
                    </div>
                    <div className="item-actions">
                      {owner && it.needs_approval ? (
                        <form action={approveWish}><Hidden item={it.id} /><SubmitButton className="btn small">✔ Approve</SubmitButton></form>
                      ) : null}
                      {!it.needs_approval && !isFund(it.kind) && ((showClaims && !it.claimed_by) || (claimedByMe && boughtQty === 0)) && !it.purchased && (
                        <ClaimButton itemId={it.id} claimed={claimedByMe} action={claimItem} />
                      )}
                      <Menu label={`More for ${it.title}`}>
                        {it.url && (
                          <form action={refreshItem}><Hidden item={it.id} /><SubmitButton className="menu-item" pendingLabel="Checking…">↻ Check price</SubmitButton></form>
                        )}
                        <form action={compareStores}><Hidden item={it.id} /><SubmitButton className="menu-item" pendingLabel="Comparing…">⚖️ Compare stores</SubmitButton></form>
                        {owner && (it.must_have || mustCount < MAX_MUST_HAVES) ? (
                          <form action={toggleMustHave}>
                            <Hidden item={it.id} action={it.must_have ? "unstar" : "star"} />
                            <SubmitButton className="menu-item">{it.must_have ? "☆ Not a must-have" : "⭐ Make a must-have"}</SubmitButton>
                          </form>
                        ) : null}
                        {owner && (
                          <>
                            <form action={archiveItem}><Hidden item={it.id} /><input type="hidden" name="reason" value="received" /><SubmitButton className="menu-item">🎁 Got it!</SubmitButton></form>
                            <form action={archiveItem}><Hidden item={it.id} /><input type="hidden" name="reason" value="unwanted" /><SubmitButton className="menu-item">🙅 Don&apos;t want it anymore</SubmitButton></form>
                          </>
                        )}
                        {owner && (
                          <form action={deleteItem}><Hidden item={it.id} /><SubmitButton className="menu-item danger" confirm="Tap again to remove">🗑️ Remove</SubmitButton></form>
                        )}
                      </Menu>
                    </div>
                    {recipient && remaining > 0 && (
                      <form action={recordPurchase} className="full">
                        <Hidden item={it.id} />
                        <input type="hidden" name="note" value="Got it myself" />
                        <SubmitButton className="btn small ghost">✔ I got this myself</SubmitButton>
                      </form>
                    )}
                    {showClaims && remaining > 0 && !it.needs_approval && !isFund(it.kind) && (
                      <details className="buy full">
                        <summary className="small pointer fw-700 text-accent">🛍️ I bought this</summary>
                        <form action={recordPurchase} className="form-grid mt-10">
                          <Hidden item={it.id} />
                          {it.quantity > 1 && <label>How many?<input name="quantity" type="number" min={1} max={remaining} defaultValue={remaining} /></label>}
                          <label>Price paid<input name="price" inputMode="decimal" defaultValue={it.price_cents ? (it.price_cents / 100).toFixed(2) : ""} /></label>
                          <label>Where<input name="store" defaultValue={it.store} /></label>
                          <label className="full">Note (optional)<input name="note" placeholder="Wrapped and in the closet" /></label>
                          <SubmitButton className="btn small">Save purchase</SubmitButton>
                          {list.review_purchases && !owner ? <p className="tiny muted full m0">A list manager will confirm this purchase.</p> : null}
                        </form>
                      </details>
                    )}
                    {showClaims && it.price_cents && !it.needs_approval && (!it.purchased || pledges.some((x) => x.item_id === it.id)) ? (
                      <GroupGift item={it} pledges={pledges.filter((x) => x.item_id === it.id)} userId={user.id} />
                    ) : null}
                    {it.url && it.price_cents && !it.purchased && !it.needs_approval ? (
                      <details className="full">
                        <summary className="small muted pointer">🎯 {watches.has(it.id) ? `Watching for ${formatMoney(watches.get(it.id))} or less` : "Watch the price"}</summary>
                        <form action={watchPrice} className="row mt-8 items-end">
                          <Hidden item={it.id} />
                          <label className="grow min-180">Tell me when it&apos;s at or below
                            <input name="target" inputMode="decimal" defaultValue={watches.has(it.id) ? (watches.get(it.id)! / 100).toFixed(2) : ((it.price_cents * 0.85) / 100).toFixed(2)} />
                          </label>
                          <SubmitButton className="btn small secondary">{watches.has(it.id) ? "Update" : "Watch"}</SubmitButton>
                          {watches.has(it.id) && <SubmitButton className="btn small ghost" name="stop" value="1">Stop</SubmitButton>}
                        </form>
                      </details>
                    ) : null}
                    {owner && (
                      <details className="full">
                        <summary className="small muted pointer">Edit</summary>
                        <div className="mt-10">
                          <ItemForm
                            action={updateItem}
                            autofill={autofill}
                            hidden={{ item_id: it.id }}
                            submitLabel="Save changes"
                            defaults={{
                              title: it.title, url: it.url, store: it.store,
                              price: it.price_cents ? (it.price_cents / 100).toFixed(2) : "",
                              image_url: it.image_url, notes: it.notes, priority: it.priority, quantity: it.quantity,
                              category: it.category, variant: it.variant, color: it.color, size: it.size, kind: it.kind,
                            }}
                          />
                          {otherLists.length > 0 && (
                            <form action={moveItem} className="row mt-12 items-end">
                              <Hidden item={it.id} />
                              <label className="grow min-200">Move to another list
                                <select name="to_list_id" defaultValue="">
                                  <option value="" disabled>Pick a list…</option>
                                  {otherLists.map((l) => <option key={l.id} value={l.id}>{l.emoji} {l.title} ({l.profile_name})</option>)}
                                </select>
                              </label>
                              <SubmitButton className="btn small secondary">Move</SubmitButton>
                            </form>
                          )}
                        </div>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
