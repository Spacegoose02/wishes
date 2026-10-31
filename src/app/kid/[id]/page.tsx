import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { canEditProfile } from "@/lib/access";
import { CATEGORIES, categoryIcon } from "@/lib/categories";
import type { Item, Profile, WishList } from "@/lib/types";
import { kidAddItem } from "../../actions/items";
import { Avatar } from "@/components/Avatar";
import { Flash, type SP } from "@/components/Flash";
import { SubmitButton } from "@/components/SubmitButton";
import { DrawPad } from "@/components/DrawPad";

export const metadata = { title: "Kid mode" };

// Big buttons and pictures for a kid using a parent's device. New wishes wait for a grown-up.
export default async function KidMode({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const user = await requireUser();
  const profile = get<Profile>("SELECT * FROM profiles WHERE id = ?", Number((await params).id));
  if (!profile || profile.is_primary || !canEditProfile(user.id, profile)) notFound();
  const lists = all<WishList>("SELECT * FROM lists WHERE profile_id = ? ORDER BY created_at DESC", profile.id);
  const sp = await searchParams;
  const list = lists.find((l) => l.id === Number(sp.list)) ?? (lists.length === 1 ? lists[0] : undefined);
  const items = list ? all<Item>("SELECT * FROM items WHERE list_id = ? ORDER BY created_at DESC", list.id) : [];

  return (
    <div className="kid narrow-760">
      <Flash searchParams={searchParams} />
      <div className="kid-head">
        <Avatar id={profile.avatar} size={96} />
        <h1 className="m0">Hi {profile.name}!</h1>
      </div>

      {!list && (
        <div className="kid-grid">
          {lists.map((l) => (
            <Link key={l.id} href={`/kid/${profile.id}?list=${l.id}`} className="kid-tile">
              <span className="kid-emoji" aria-hidden="true">{l.emoji}</span>
              <span>{l.title}</span>
            </Link>
          ))}
          {lists.length === 0 && <p className="kid-say">Ask a grown-up to make you a list first!</p>}
        </div>
      )}

      {list && (
        <>
          <h2 className="kid-say">{list.emoji} {list.title}</h2>
          <form action={kidAddItem} className="card kid-add">
            <input type="hidden" name="list_id" value={list.id} />
            <label className="kid-say" htmlFor="kid-title">What do you wish for?</label>
            <input id="kid-title" name="title" required maxLength={200} autoComplete="off" placeholder="A red bike!" />
            <fieldset className="kid-cats">
              <legend className="sr-only">What kind of thing is it?</legend>
              {CATEGORIES.filter((c) => !["fragrance", "beauty", "jewelry", "experiences"].includes(c.id)).map((c, i) => (
                <label key={c.id} title={c.label}>
                  <input type="radio" name="category" value={c.id} defaultChecked={i === 0} />
                  <span aria-hidden="true">{c.icon}</span><span className="sr-only">{c.label}</span>
                </label>
              ))}
            </fieldset>
            <details>
              <summary className="kid-say pointer">🎨 Draw it!</summary>
              <DrawPad />
            </details>
            <SubmitButton className="btn kid-btn">✨ Make a wish</SubmitButton>
          </form>

          <div className="kid-grid mt-16">
            {items.map((it) => (
              <div key={it.id} className="kid-tile">
                <span className="kid-pic">{it.image_url ? <img src={it.image_url} alt="" referrerPolicy="no-referrer" /> : <span aria-hidden="true">{categoryIcon(it.category)}</span>}</span>
                <span>{it.title}</span>
                {it.needs_approval ? <span className="pill">⏳ Waiting for a grown-up</span> : null}
              </div>
            ))}
          </div>
          {lists.length > 1 && <p className="text-center mt-16"><Link href={`/kid/${profile.id}`} className="btn secondary kid-btn">← My other lists</Link></p>}
        </>
      )}

      <p className="text-center mt-24"><Link href="/" className="small muted">Grown-ups: exit kid mode</Link></p>
    </div>
  );
}
