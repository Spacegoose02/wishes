import Link from "next/link";
import type { ListWithOwner } from "@/lib/access";
import { daysUntil } from "@/lib/format";
import type { Freshness } from "@/lib/fresh";
import { Avatar } from "./Avatar";

const VIS: Record<string, string> = { private: "🔒 Only me", family: "👨‍👩‍👧 Family", custom: "✨ Custom" };

export function ListCard({ list, showOwner, fresh }: { list: ListWithOwner; showOwner?: boolean; fresh?: Freshness }) {
  const days = daysUntil(list.event_date);
  return (
    <Link href={`/lists/${list.id}`} className="card list-card">
      <div className="row between">
        <span className="list-emoji" aria-hidden="true">{list.emoji}</span>
        {showOwner ? (
          <span className="row gap-6">
            <Avatar id={list.profile_avatar} size={28} />
            <span className="small fw-700">{list.profile_name}</span>
          </span>
        ) : (
          <span className="pill">{VIS[list.visibility]}</span>
        )}
      </div>
      <div>
        <h3 className="mb-2">{list.title}</h3>
        {list.description && <p className="small muted m0">{list.description}</p>}
      </div>
      <div className="row gap-6">
        <span className="pill">{list.item_count ?? 0} {list.item_count === 1 ? "wish" : "wishes"}</span>
        {fresh?.newWishes ? <span className="pill good">✨ {fresh.newWishes} new</span> : fresh?.neverSeen ? <span className="pill good">✨ New list</span> : null}
        {list.occasion && <span className="pill accent">{list.occasion}</span>}
        {days !== undefined && days >= 0 && <span className="pill good">{days === 0 ? "Today!" : `${days} days`}</span>}
      </div>
    </Link>
  );
}
