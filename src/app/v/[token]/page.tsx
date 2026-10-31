import { notFound } from "next/navigation";
import { getList } from "@/lib/access";
import { listByViewToken } from "@/lib/lists";
import { Avatar } from "@/components/Avatar";
import { ListSheet } from "@/components/ListSheet";

export const metadata = { title: "Wish list", robots: { index: false } };

// Read-only list behind a secret link (from a printout's QR code). No account, no spoilers.
export default async function ReadOnlyList({ params }: { params: Promise<{ token: string }> }) {
  const row = listByViewToken((await params).token);
  const list = row && getList(row.id);
  if (!list) notFound();
  return (
    <div className="narrow-760">
      <div className="row mt-8">
        <span className="kid-emoji" aria-hidden="true">{list.emoji}</span>
        <div>
          <h1 className="m0">{list.title}</h1>
          <span className="row gap-6"><Avatar id={list.profile_avatar} size={24} /><span className="small muted">{list.profile_name}&apos;s list{list.occasion ? ` · ${list.occasion}` : ""}</span></span>
        </div>
      </div>
      {list.description && <p className="muted">{list.description}</p>}
      <div className="card mt-12"><ListSheet listId={list.id} /></div>
    </div>
  );
}
