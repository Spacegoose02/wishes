import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getList } from "@/lib/access";
import { all } from "@/lib/db";
import { aiConfig, aiEnabled, PROVIDERS } from "@/lib/ai";
import { formatMoney } from "@/lib/format";
import type { Suggestion } from "@/lib/types";
import { requestSuggestions, reviewSuggestion } from "../../../actions/app";
import { Flash, type SP } from "@/components/Flash";

export default async function IdeasPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const user = await requireUser();
  const list = getList(Number((await params).id));
  if (!list || list.owner_user_id !== user.id) notFound();
  const pending = all<Suggestion>("SELECT * FROM suggestions WHERE list_id = ? AND status = 'pending' ORDER BY created_at DESC", list.id);
  const cfg = aiConfig();
  const label = PROVIDERS.find((p) => p.id === cfg.provider)?.label;
  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <p><Link href={`/lists/${list.id}`}>← Back to {list.title}</Link></p>
      <h1>✨ Gift ideas</h1>
      <p className="muted">Ideas wait here for you to review. Nothing is added to the list until you say yes.</p>
      <Flash searchParams={searchParams} />
      {aiEnabled() ? (
        <form action={requestSuggestions} className="card stack">
          <input type="hidden" name="list_id" value={list.id} />
          <label>Anything to steer the ideas? (optional)<input name="hint" placeholder="Loves dinosaurs and art, under $40" /></label>
          <div className="row between">
            <span className="tiny muted">Using {label} · {cfg.model}</span>
            <button className="btn">Get ideas</button>
          </div>
        </form>
      ) : (
        <div className="card">AI ideas are turned off. {user.is_admin ? <Link href="/admin">Turn them on in Admin.</Link> : "Ask your admin to turn them on."}</div>
      )}

      <section className="section">
        <h2>Waiting for review ({pending.length})</h2>
        {pending.length === 0 && <div className="card empty"><div className="big">🦝</div>No ideas waiting.</div>}
        <div className="items">
          {pending.map((sg) => (
            <div key={sg.id} className="card row between" style={{ alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div className="item-title">{sg.title}</div>
                {sg.est_price_cents ? <span className="pill">~{formatMoney(sg.est_price_cents)}</span> : null}
                {sg.reason && <p className="small muted" style={{ margin: "6px 0 0" }}>{sg.reason}</p>}
              </div>
              <div className="row" style={{ gap: 6 }}>
                <form action={reviewSuggestion}>
                  <input type="hidden" name="suggestion_id" value={sg.id} />
                  <input type="hidden" name="decision" value="accept" />
                  <button className="btn small">Add to list</button>
                </form>
                <form action={reviewSuggestion}>
                  <input type="hidden" name="suggestion_id" value={sg.id} />
                  <input type="hidden" name="decision" value="reject" />
                  <button className="btn small ghost">No thanks</button>
                </form>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
