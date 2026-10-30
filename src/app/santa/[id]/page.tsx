import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { sharedWithMe } from "@/lib/access";
import { daysUntil, formatMoney } from "@/lib/format";
import { eligiblePeople, getExchange, isFamilyAdmin, myMatch, participants } from "@/lib/santa";
import { deleteExchange, drawExchange, markSantaDone, saveExchange } from "../../actions/santa";
import { Avatar } from "@/components/Avatar";
import { Flash, type SP } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Secret Santa" };

export default async function ExchangePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const user = await requireUser();
  const ex = getExchange(Number((await params).id));
  if (!ex) notFound();
  const people = participants(ex.id);
  const me = people.find((p) => p.user_id === user.id);
  const admin = isFamilyAdmin(user.id, ex.family_id);
  if (!me && !admin) notFound();
  const match = me ? myMatch(ex.id, user.id) : undefined;
  const theirLists = match ? sharedWithMe(user.id).filter((l) => l.owner_user_id === match.id && l.profile_is_primary) : [];
  const days = daysUntil(ex.exchange_date);
  const inIds = new Set(people.map((p) => p.user_id));
  const eligible = admin ? eligiblePeople(ex.family_id) : [];
  const doneCount = people.filter((p) => p.done).length;

  return (
    <div className="narrow-760">
      <Flash searchParams={searchParams} />
      <p className="small m0"><Link href="/santa">← Secret Santa</Link></p>
      <h1 className="mb-4">🎅 {ex.name}</h1>
      <div className="row gap-6">
        {ex.budget_cents ? <span className="pill accent">{formatMoney(ex.budget_cents)} budget</span> : null}
        {ex.exchange_date && <span className="pill">{new Date(ex.exchange_date + "T00:00:00").toLocaleDateString()}</span>}
        {days !== undefined && days >= 0 && <span className="pill good">{days === 0 ? "Today!" : `${days} days to go`}</span>}
      </div>

      {me && (
        <section className="card section text-center">
          {match ? (
            <>
              <p className="muted m0">You&apos;re Secret Santa for…</p>
              <div className="row justify-center mt-10"><Avatar id={match.avatar} size={84} /></div>
              <h2 className="mt-8">{match.name}</h2>
              {theirLists.length > 0 ? (
                <div className="row justify-center gap-6">
                  {theirLists.map((l) => <Link key={l.id} href={`/lists/${l.id}`} className="btn small secondary">{l.emoji} {l.title}</Link>)}
                </div>
              ) : (
                <p className="small muted">{match.name} hasn&apos;t shared a list with you yet.</p>
              )}
              <form action={markSantaDone} className="mt-16">
                <input type="hidden" name="exchange_id" value={ex.id} />
                <input type="hidden" name="done" value={me.done ? "0" : "1"} />
                <SubmitButton className={`btn small${me.done ? " ghost" : ""}`}>{me.done ? "✅ Gift sorted (undo)" : "I've got their gift"}</SubmitButton>
              </form>
              <p className="tiny muted mt-8 m0">Shh! Nobody else can see who you drew, not even the organizer.</p>
            </>
          ) : (
            <p className="m0">You&apos;re in! Names haven&apos;t been drawn yet.</p>
          )}
        </section>
      )}

      {admin && (
        <section className="card section">
          <div className="section-head">
            <h2 className="m0">Organize</h2>
            {ex.drawn_at && <span className="small muted">{doneCount} of {people.length} have their gift</span>}
          </div>
          <form action={saveExchange} className="stack">
            <input type="hidden" name="exchange_id" value={ex.id} />
            <div className="form-grid">
              <label>Name<input name="name" defaultValue={ex.name} /></label>
              <label>Budget<input name="budget" inputMode="decimal" defaultValue={ex.budget_cents ? (ex.budget_cents / 100).toFixed(2) : ""} /></label>
              <label>Exchange day<input name="exchange_date" type="date" defaultValue={ex.exchange_date ?? ""} /></label>
            </div>
            <p className="small fw-700 m0">Who&apos;s in? People with the same household name never draw each other.</p>
            <table className="table">
              <tbody>
                {eligible.map((p) => {
                  const cur = people.find((x) => x.user_id === p.id);
                  return (
                    <tr key={p.id}>
                      <td>
                        <label className="row gap-8 nowrap">
                          <input type="checkbox" name="people" value={p.id} defaultChecked={inIds.has(p.id)} />
                          <Avatar id={p.avatar} size={28} /> {p.name}
                        </label>
                      </td>
                      <td>
                        <input name={`household_${p.id}`} defaultValue={cur?.household ?? p.household} placeholder="Household" aria-label={`${p.name}'s household`} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <SubmitButton className="btn secondary">Save{ex.drawn_at ? " (changing people means drawing again)" : ""}</SubmitButton>
          </form>
          <div className="row mt-16">
            <form action={drawExchange}>
              <input type="hidden" name="exchange_id" value={ex.id} />
              <SubmitButton className="btn" confirm={ex.drawn_at ? "Redraw everyone's names?" : undefined} disabled={people.length < 3}>
                {ex.drawn_at ? "🎲 Redraw names" : "🎲 Draw names"}
              </SubmitButton>
            </form>
            <form action={deleteExchange}>
              <input type="hidden" name="exchange_id" value={ex.id} />
              <SubmitButton className="btn ghost" confirm="Delete this exchange?">Delete</SubmitButton>
            </form>
          </div>
        </section>
      )}
    </div>
  );
}
