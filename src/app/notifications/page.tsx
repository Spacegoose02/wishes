import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { markAllRead } from "../actions/account";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Alerts" };

const ICON: Record<string, string> = {
  deal: "🏷️", family: "🏡", purchase: "🧾", info: "💡", approval: "🧒", badge: "🌟", pledge: "🤝",
  reminder: "⏰", santa: "🎅", thanks: "💌", unwanted: "🙅",
};

export default async function NotificationsPage() {
  const user = await requireUser();
  const rows = all<{ id: number; kind: string; message: string; link: string; read: number; created_at: number }>(
    "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 100", user.id,
  );
  return (
    <div className="narrow-720">
      <div className="section-head">
        <h1 className="m0">Alerts</h1>
        {rows.some((r) => !r.read) && <form action={markAllRead}><SubmitButton className="btn small secondary">Mark all read</SubmitButton></form>}
      </div>
      <p className="muted">Price drops, purchases and approvals, group gifts, Secret Santa, thank-yous, reminders before the big day, and family news.</p>
      <div className="card">
        {rows.length === 0 && <div className="empty"><div className="big" aria-hidden="true">🔔</div>All quiet.</div>}
        {rows.map((r) => (
          <div key={r.id} className={`notice ${r.read ? "" : "unread"}`}>
            <span style={{ fontSize: "1.3rem" }}>{ICON[r.kind] ?? "💡"}</span>
            <div className="grow">
              <div className="msg">{r.link ? <Link href={r.link}>{r.message}</Link> : r.message}</div>
              <div className="tiny muted">{new Date(r.created_at * 1000).toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
