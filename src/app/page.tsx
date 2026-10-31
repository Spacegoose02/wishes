import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { myLists, myProfiles, myFamilies } from "@/lib/access";
import { ListCard } from "@/components/ListCard";
import { RenameKid } from "@/components/RenameKid";
import { Avatar } from "@/components/Avatar";
import { Flash, type SP } from "@/components/Flash";
import { sleepsLabel, upcomingEvents } from "@/lib/countdown";
import { monthsAgo, sizeSummary, sizesStale } from "@/lib/profile";
import { confirmSizes } from "./actions/account";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "My lists" };

export default async function Home({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const profiles = myProfiles(user.id);
  const lists = myLists(user.id);
  const families = myFamilies(user.id);
  const sp = await searchParams;
  const upcoming = upcomingEvents(user).slice(0, 3);
  const sizeChecks = profiles.filter((p) => !p.linked_user_id && sizesStale(p));
  return (
    <>
      <Flash searchParams={searchParams} />
      <div className="section-head mt-8">
        <div className="row">
          <Avatar id={user.avatar} size={52} />
          <div>
            <h1 className="m0">Hi, {user.name.split(" ")[0]}!</h1>
            <p className="muted m0">What are we wishing for?</p>
          </div>
        </div>
        <Link href="/lists/new" className="btn">＋ New list</Link>
      </div>

      {upcoming.length > 0 && (
        <div className="countdown mt-12">
          {upcoming.map((u) => (
            <Link key={u.key} href={u.href} className="countdown-item">
              <span className="countdown-emoji" aria-hidden="true">{u.emoji}</span>
              <span>
                {sleepsLabel(u.days, u.label).count !== null && <strong className="countdown-n">{u.days}</strong>}
                <span>{sleepsLabel(u.days, u.label).text}</span>
              </span>
            </Link>
          ))}
        </div>
      )}

      {sizeChecks.map((p) => (
        <div key={p.id} className="card mt-12 row">
          <span className="countdown-emoji" aria-hidden="true">📏</span>
          <div className="grow min-180">
            <strong>Size check{p.is_primary ? "" : ` for ${p.name}`}?</strong>
            <p className="small muted m0">Last updated {monthsAgo(p.sizes_updated_at) || "6+"} months ago: {sizeSummary(p)}</p>
          </div>
          <form action={confirmSizes}>
            <input type="hidden" name="profile_id" value={p.id} />
            <SubmitButton className="btn small ghost">Still right</SubmitButton>
          </form>
          <Link href={p.is_primary ? "/settings?tab=me" : `/settings?tab=profiles&edit=${p.id}#profile-${p.id}`} className="btn small">Update sizes</Link>
        </div>
      ))}

      {(sp.welcome || families.length === 0) && (
        <div className="card mt-12">
          <h2>👋 Get started</h2>
          <p className="muted">Create or join a family so the people you love can see your lists. Add profiles for kids from Settings.</p>
          <div className="row">
            <Link href="/families" className="btn secondary">Set up a family</Link>
            <Link href="/settings" className="btn ghost">Add a kid profile</Link>
          </div>
        </div>
      )}

      {lists.some((l) => l.owner_user_id !== user.id) && (
        <section className="section">
          <div className="section-head"><h2 className="m0">🤝 Lists I help manage</h2></div>
          <div className="grid">{lists.filter((l) => l.owner_user_id !== user.id).map((l) => <ListCard key={l.id} list={l} showOwner />)}</div>
        </section>
      )}

      {profiles.map((p) => {
        const pl = lists.filter((l) => l.profile_id === p.id);
        return (
          <section key={p.id} className="section">
            <div className="section-head">
              <div className="row gap-8">
                <Avatar id={p.avatar} size={34} />
                <h2 className="m0">{p.is_primary ? "My lists" : `${p.name}'s lists`}</h2>
              </div>
              <div className="row gap-6">
                {!p.is_primary && !p.linked_user_id && <Link href={`/kid/${p.id}`} className="btn small">🧒 Kid mode</Link>}
                {!p.is_primary && <RenameKid id={p.id} name={p.name} back="/" />}
                {!p.is_primary && <Link href={`/settings?tab=profiles&edit=${p.id}#profile-${p.id}`} className="btn small ghost">Details</Link>}
                <Link href={`/lists/new?profile=${p.id}`} className="btn small secondary">＋ List</Link>
              </div>
            </div>
            {pl.length ? (
              <div className="grid">{pl.map((l) => <ListCard key={l.id} list={l} />)}</div>
            ) : (
              <div className="card empty"><div className="big" aria-hidden="true">🪄</div>No lists yet. <Link href={`/lists/new?profile=${p.id}`}>Start one</Link></div>
            )}
          </section>
        );
      })}
    </>
  );
}
