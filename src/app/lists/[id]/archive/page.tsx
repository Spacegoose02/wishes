import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { getList, listAccess } from "@/lib/access";
import { categoryIcon } from "@/lib/categories";
import type { Item } from "@/lib/types";
import { restoreItem } from "../../../actions/items";
import { SubmitButton } from "@/components/SubmitButton";

export const metadata = { title: "Past gifts" };

// Wishes that were received or are no longer wanted. No purchase details, so it's safe for everyone.
export default async function ArchivePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const list = getList(Number((await params).id));
  if (!list) notFound();
  const access = listAccess(user, list);
  if (access === "none") notFound();
  const items = all<Item>("SELECT * FROM items WHERE list_id = ? AND archived_at IS NOT NULL AND needs_approval = 0 ORDER BY archived_at DESC", list.id);
  const groups = [
    { reason: "received", title: "🎁 Got it", items: items.filter((i) => i.archive_reason !== "unwanted") },
    { reason: "unwanted", title: "🙅 Not wanted anymore", items: items.filter((i) => i.archive_reason === "unwanted") },
  ].filter((g) => g.items.length);
  return (
    <div className="narrow-820">
      <p className="small m0"><Link href={`/lists/${list.id}`}>← {list.title}</Link></p>
      <h1>🗃️ Past gifts</h1>
      {groups.length === 0 && <div className="card empty"><div className="big" aria-hidden="true">🗃️</div>Nothing here yet.</div>}
      {groups.map((g) => (
        <section key={g.reason} className="section">
          <h2>{g.title}</h2>
          <div className="items">
            {g.items.map((it) => (
              <div key={it.id} className="card item">
                <div className="item-img">{it.image_url ? <img src={it.image_url} alt="" referrerPolicy="no-referrer" loading="lazy" /> : categoryIcon(it.category)}</div>
                <div className="min-0">
                  {it.url ? <a className="item-title" href={it.url} target="_blank" rel="noopener noreferrer nofollow">{it.title}</a> : <span className="item-title">{it.title}</span>}
                  <p className="tiny muted m0 mt-4">{new Date(it.archived_at! * 1000).toLocaleDateString()}</p>
                </div>
                <div className="item-actions">
                  {access === "owner" && (
                    <form action={restoreItem}>
                      <input type="hidden" name="item_id" value={it.id} />
                      <SubmitButton className="btn small ghost">Put back on the list</SubmitButton>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
