import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { formatMoney } from "@/lib/format";

// Everything the signed-in person has bought, across all lists.
export default async function MyPurchasesPage() {
  const user = await requireUser();
  const rows = all<{ id: number; list_id: number; item_title: string; quantity: number; price_cents: number | null; store: string; status: string; created_at: number; list_title: string; for_name: string }>(
    `SELECT pu.*, l.title AS list_title, p.name AS for_name FROM purchases pu
     JOIN lists l ON l.id = pu.list_id JOIN profiles p ON p.id = l.profile_id
     WHERE pu.buyer_user_id = ? ORDER BY pu.created_at DESC`,
    user.id,
  );
  const total = rows.filter((r) => r.status !== "rejected").reduce((s, r) => s + (r.price_cents ?? 0) * r.quantity, 0);
  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>🛍️ What I&apos;ve bought</h1>
        {total > 0 && <span className="muted">{formatMoney(total)} total</span>}
      </div>
      <div className="card">
        {rows.length === 0 && <div className="empty"><div className="big">🪿</div>Nothing yet. Open a family list and tap &quot;I bought this&quot;.</div>}
        {rows.map((r) => (
          <div key={r.id} className="notice">
            <div style={{ flex: 1 }}>
              <div className="msg">
                {r.quantity > 1 ? `${r.quantity} × ` : ""}{r.item_title} <span className="muted">for {r.for_name}</span>
              </div>
              <div className="tiny muted">
                <Link href={`/lists/${r.list_id}`}>{r.list_title}</Link> · {new Date(r.created_at * 1000).toLocaleDateString()}
                {r.store ? ` · ${r.store}` : ""}{r.status === "pending" ? " · waiting for review" : r.status === "rejected" ? " · not confirmed" : ""}
              </div>
            </div>
            <strong>{r.price_cents ? formatMoney(r.price_cents * r.quantity) : ""}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
