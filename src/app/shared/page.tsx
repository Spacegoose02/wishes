import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { sharedWithMe } from "@/lib/access";
import { ListCard } from "@/components/ListCard";

export const metadata = { title: "Family lists" };

export default async function SharedPage() {
  const user = await requireUser();
  const lists = sharedWithMe(user.id);
  const byPerson = new Map<string, typeof lists>();
  for (const l of lists) {
    const k = l.profile_name;
    byPerson.set(k, [...(byPerson.get(k) ?? []), l]);
  }
  return (
    <>
      <div className="section-head">
        <h1 style={{ margin: 0 }}>Family lists</h1>
        <Link href="/purchases" className="btn small secondary">🛍️ What I&apos;ve bought</Link>
      </div>
      <p className="muted">Lists your families shared with you. Claim a gift so nobody doubles up; the list owner won&apos;t see it.</p>
      {lists.length === 0 && (
        <div className="card empty"><div className="big" aria-hidden="true">🏡</div>Nothing shared yet. <Link href="/families">Join or create a family</Link> to see their lists.</div>
      )}
      {[...byPerson.entries()].map(([name, ls]) => (
        <section key={name} className="section">
          <h2>{name}</h2>
          <div className="grid">{ls.map((l) => <ListCard key={l.id} list={l} showOwner />)}</div>
        </section>
      ))}
    </>
  );
}
