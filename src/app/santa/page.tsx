import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { myFamilies } from "@/lib/access";
import { myExchanges } from "@/lib/santa";
import { formatMoney } from "@/lib/format";
import { createExchange } from "../actions/santa";
import { Flash, type SP } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Secret Santa" };

export default async function SantaPage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const exchanges = myExchanges(user.id);
  const adminOf = myFamilies(user.id).filter((f) => f.role === "admin");
  return (
    <div className="narrow-760">
      <Flash searchParams={searchParams} />
      <h1>🎅 Secret Santa</h1>
      <p className="muted">Everyone draws one name and only sees their own. Nobody gets themselves or someone from their own household.</p>

      <div className="stack mt-12">
        {exchanges.length === 0 && <div className="card empty"><div className="big" aria-hidden="true">🎁</div>No exchanges yet.</div>}
        {exchanges.map((e) => (
          <Link key={e.id} href={`/santa/${e.id}`} className="card list-card">
            <div className="row gap-8">
              <strong className="grow">{e.name}</strong>
              <span className="pill">{e.family_name}</span>
              {e.drawn_at ? <span className="pill good">Names drawn</span> : <span className="pill">Not drawn yet</span>}
            </div>
            <p className="small muted m0 mt-4">
              {[e.exchange_date && new Date(e.exchange_date + "T00:00:00").toLocaleDateString(), e.budget_cents && `${formatMoney(e.budget_cents)} budget`, !e.in_it && "you're organizing"].filter(Boolean).join(" · ")}
            </p>
          </Link>
        ))}
      </div>

      {adminOf.length > 0 && (
        <form action={createExchange} className="card stack mt-24">
          <h2 className="m0">Start an exchange</h2>
          <div className="form-grid">
            <label>Family
              <select name="family_id">{adminOf.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
            </label>
            <label>Name<input name="name" placeholder={`Secret Santa ${new Date().getFullYear()}`} /></label>
            <label>Budget<input name="budget" inputMode="decimal" placeholder="25" /></label>
            <label>Exchange day<input name="exchange_date" type="date" /></label>
          </div>
          <SubmitButton className="btn">Create</SubmitButton>
        </form>
      )}
      {adminOf.length === 0 && exchanges.length === 0 && <p className="small muted mt-12">A family admin can start one from here.</p>}
    </div>
  );
}
