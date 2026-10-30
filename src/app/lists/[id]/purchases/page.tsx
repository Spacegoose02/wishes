import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getList, isManager, isRecipient, listAccess } from "@/lib/access";
import { all } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import type { Purchase } from "@/lib/types";
import { reviewPurchase, undoPurchase } from "../../../actions/app";
import { Flash, type SP } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Purchases" };

const STATUS: Record<string, string> = { confirmed: "✅ Confirmed", pending: "⏳ Waiting for review", rejected: "✖ Not confirmed" };

export default async function PurchasesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const user = await requireUser();
  const list = getList(Number((await params).id));
  if (!list || listAccess(user, list) === "none" || isRecipient(user.id, list)) notFound();
  const manager = isManager(user.id, list);
  const rows = all<Purchase>("SELECT * FROM purchases WHERE list_id = ? ORDER BY status = 'pending' DESC, created_at DESC", list.id);
  const pending = rows.filter((r) => r.status === "pending");
  const spent = rows.filter((r) => r.status !== "rejected").reduce((s, r) => s + (r.price_cents ?? 0) * r.quantity, 0);
  const byBuyer = new Map<string, number>();
  for (const r of rows) if (r.status !== "rejected") byBuyer.set(r.buyer_name, (byBuyer.get(r.buyer_name) ?? 0) + (r.price_cents ?? 0) * r.quantity);

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <p><Link href={`/lists/${list.id}`}>← Back to {list.title}</Link></p>
      <h1>🧾 Purchases for {list.profile_name}</h1>
      <p className="muted">
        Everything bought from this list and who bought it. {list.profile_is_primary ? `${list.profile_name} can't see this page.` : ""}
      </p>
      <Flash searchParams={searchParams} />

      {manager && pending.length > 0 && (
        <section className="card stack">
          <h2>Needs your review ({pending.length})</h2>
          <p className="small muted" style={{ margin: 0 }}>Confirm purchases made by people who don&apos;t manage this list.</p>
          {pending.map((p) => (
            <div key={p.id} className="row between notice">
              <div>
                <strong>{p.buyer_name}</strong> bought {p.quantity > 1 ? `${p.quantity} × ` : ""}<strong>{p.item_title}</strong>
                {p.price_cents ? ` for ${formatMoney(p.price_cents)}` : ""}{p.store ? ` at ${p.store}` : ""}
                {p.note && <div className="small muted">“{p.note}”</div>}
              </div>
              <div className="row" style={{ gap: 6 }}>
                {(["approve", "reject"] as const).map((d) => (
                  <form key={d} action={reviewPurchase}>
                    <input type="hidden" name="purchase_id" value={p.id} />
                    <input type="hidden" name="decision" value={d} />
                    <SubmitButton className={`btn small ${d === "approve" ? "" : "ghost"}`}>{d === "approve" ? "Confirm" : "Not right"}</SubmitButton>
                  </form>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <div className="section-head">
          <h2 style={{ margin: 0 }}>History</h2>
          {spent > 0 && <span className="small muted">{formatMoney(spent)} spent in total</span>}
        </div>
        {byBuyer.size > 1 && (
          <div className="row" style={{ gap: 6, marginBottom: 10 }}>
            {[...byBuyer.entries()].map(([name, cents]) => <span key={name} className="pill">{name}: {formatMoney(cents)}</span>)}
          </div>
        )}
        {rows.length === 0 && <div className="empty"><div className="big" aria-hidden="true">🛍️</div>Nothing bought yet.</div>}
        {rows.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Gift</th><th>Bought by</th><th>Paid</th><th>When</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>{p.quantity > 1 ? `${p.quantity} × ` : ""}{p.item_title}{p.note && <div className="tiny muted">{p.note}</div>}</td>
                    <td>{p.buyer_name}</td>
                    <td>{p.price_cents ? formatMoney(p.price_cents * p.quantity) : "—"}{p.store && <div className="tiny muted">{p.store}</div>}</td>
                    <td className="small">{new Date(p.created_at * 1000).toLocaleDateString()}</td>
                    <td className="small">{STATUS[p.status]}</td>
                    <td>
                      {(p.buyer_user_id === user.id || manager) && (
                        <form action={undoPurchase}>
                          <input type="hidden" name="purchase_id" value={p.id} />
                          <SubmitButton className="btn small ghost">Remove</SubmitButton>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
