import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { myLists } from "@/lib/access";
import { extractUrls } from "@/lib/links";
import { Avatar } from "@/components/Avatar";
import type { SP } from "@/components/Flash";

export const metadata = { title: "Add to Wishes" };

// Target of the PWA share sheet: pick a list, then the add-wish form opens with the link filled in.
export default async function SharePage({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const url = extractUrls(`${str("url")} ${str("text")} ${str("title")}`)[0];
  const lists = myLists(user.id);
  if (url && lists.length === 1) redirect(`/lists/${lists[0].id}?add=${encodeURIComponent(url)}`);
  return (
    <div className="narrow-640">
      <h1>✨ Add to Wishes</h1>
      {!url ? (
        <div className="card empty"><div className="big" aria-hidden="true">🔗</div>No link came through. Try sharing the product page itself.</div>
      ) : lists.length === 0 ? (
        <div className="card empty">You don&apos;t have a list yet. <Link href="/lists/new">Make one first</Link>.</div>
      ) : (
        <>
          <p className="muted small" style={{ wordBreak: "break-all" }}>{url}</p>
          <p className="fw-700">Which list?</p>
          <div className="stack">
            {lists.map((l) => (
              <Link key={l.id} href={`/lists/${l.id}?add=${encodeURIComponent(url)}`} className="card list-card row gap-8">
                <span aria-hidden="true">{l.emoji}</span>
                <strong className="grow">{l.title}</strong>
                <Avatar id={l.profile_avatar} size={24} /><span className="small muted">{l.profile_name}</span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
