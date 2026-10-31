import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { daysUntil, formatMoney } from "@/lib/format";
import { budgetPeople, budgetsFor, spendByPerson, toBuy } from "@/lib/shopping";
import { saveBudget } from "../actions/purchases";
import { Flash, type SP } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { Tracking } from "@/components/Tracking";
import { Avatar } from "@/components/Avatar";

export const metadata = { title: "My shopping" };

// The giver's view: what's still to buy (soonest event first), spend per person,
// and everything bought so far across all lists.
export default async function MyShoppingPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const todo = toBuy(user);
  const year = new Date().getFullYear();
  const spend = spendByPerson(user.id, year);
  const budgets = budgetsFor(user.id, year);
  const people = budgetPeople(user.id);
  const rows = all<{ id: number; list_id: number; item_title: string; quantity: number; price_cents: number | null; store: string; status: string; created_at: number; list_title: string; for_name: string; tracking: string; carrier: string; expected_at: string | null }>(
    `SELECT pu.*, l.title AS list_title, p.name AS for_name FROM purchases pu
     JOIN lists l ON l.id = pu.list_id JOIN profiles p ON p.id = l.profile_id
     WHERE pu.buyer_user_id = ? ORDER BY pu.created_at DESC`,
    user.id,
  );
  const total = rows.filter((r) => r.status !== "rejected").reduce((s, r) => s + (r.price_cents ?? 0) * r.quantity, 0);
  const todoTotal = todo.reduce((s, r) => s + (r.price_cents ?? 0) * r.quantity, 0);
  return (
    <div className="narrow-820">
      <Flash searchParams={searchParams} />
      <h1>🛍️ My shopping</h1>

      <section className="section">
        <div className="section-head">
          <h2 className="m0">Still to buy</h2>
          {todoTotal > 0 && <span className="muted small">About {formatMoney(todoTotal)}</span>}
        </div>
        <div className="card">
          {todo.length === 0 && <div className="empty"><div className="big" aria-hidden="true">🎀</div>Nothing claimed. Tap &quot;I&apos;ll get it&quot; on a family list to plan a gift.</div>}
          {todo.map((r) => {
            const days = daysUntil(r.event_date);
            return (
              <div key={r.id} className="notice">
                <Avatar id={r.for_avatar} size={30} />
                <div className="grow min-0">
                  <div className="msg">
                    {r.quantity > 1 ? `${r.quantity} × ` : ""}
                    {r.url ? <a href={r.url} target="_blank" rel="noopener noreferrer nofollow">{r.title}</a> : r.title}{" "}
                    <span className="muted">for {r.for_name}</span>
                  </div>
                  <div className="tiny muted">
                    <Link href={`/lists/${r.list_id}#item-${r.id}`}>{r.list_emoji} {r.list_title}</Link>
                    {days !== undefined && (days >= 0 ? ` · ${days === 0 ? "today!" : `${days} days to go`}` : " · event passed")}
                  </div>
                </div>
                <strong>{r.price_cents ? formatMoney(r.price_cents * r.quantity) : ""}</strong>
              </div>
            );
          })}
        </div>
      </section>

      {spend.length > 0 && (
        <section className="section">
          <div className="section-head"><h2 className="m0">Spent per person in {year}</h2></div>
          <div className="card">
            {spend.map((p) => (
              <div key={p.profile_id} className="notice">
                <Avatar id={p.avatar} size={30} />
                <div className="grow msg">{p.name} <span className="tiny muted">· {p.gifts} {p.gifts === 1 ? "gift" : "gifts"}</span></div>
                <strong>{formatMoney(p.spent_cents)}</strong>
              </div>
            ))}
          </div>
        </section>
      )}

      <section id="budgets" className="section">
        <div className="section-head"><h2 className="m0">Budgets for {year}</h2></div>
        <div className="card stack">
          {budgets.length === 0 && <p className="small muted m0">Set a budget per person (or per occasion) to see spent vs left.</p>}
          {budgets.map((b) => (
            <div key={b.id}>
              <div className="row gap-8">
                <Avatar id={b.avatar} size={26} />
                <strong className="grow">{b.name}{b.occasion ? <span className="muted"> · {b.occasion}</span> : null}</strong>
                <span className={`small fw-700${b.over ? " text-bad" : ""}`}>
                  {formatMoney(b.spent_cents)} of {formatMoney(b.amount_cents)} · {b.over ? `${formatMoney(b.spent_cents - b.amount_cents)} over` : `${formatMoney(b.left_cents)} left`}
                </span>
              </div>
              <div className={`progress mt-6${b.over ? " over" : ""}`} role="progressbar" aria-valuenow={b.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Budget used for ${b.name}`}>
                <span style={{ width: `${b.pct}%` }} />
              </div>
            </div>
          ))}
          {people.length > 0 && (
            <form action={saveBudget} className="form-grid">
              <label>Who
                <select name="profile_id">{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
              </label>
              <label>Occasion (optional)<input name="occasion" placeholder="Christmas" /></label>
              <label>Budget<input name="amount" inputMode="decimal" placeholder="100 (0 to remove)" /></label>
              <SubmitButton className="btn small secondary">Save budget</SubmitButton>
            </form>
          )}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="m0">What I&apos;ve bought</h2>
          {total > 0 && <span className="muted small">{formatMoney(total)} total</span>}
        </div>
        <div className="card">
          {rows.length === 0 && <div className="empty"><div className="big" aria-hidden="true">🪿</div>Nothing yet. Open a family list and tap &quot;I bought this&quot;.</div>}
          {rows.map((r) => (
            <div key={r.id} className="notice">
              <div className="grow">
                <div className="msg">
                  {r.quantity > 1 ? `${r.quantity} × ` : ""}{r.item_title} <span className="muted">for {r.for_name}</span>
                </div>
                <div className="tiny muted">
                  <Link href={`/lists/${r.list_id}`}>{r.list_title}</Link> · {new Date(r.created_at * 1000).toLocaleDateString()}
                  {r.store ? ` · ${r.store}` : ""}{r.status === "pending" ? " · waiting for review" : r.status === "rejected" ? " · not confirmed" : ""}
                </div>
                {r.status !== "rejected" && <Tracking p={r} back="/purchases" />}
              </div>
              <strong>{r.price_cents ? formatMoney(r.price_cents * r.quantity) : ""}</strong>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
