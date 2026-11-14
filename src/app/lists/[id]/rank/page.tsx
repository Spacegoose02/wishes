import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { all } from "@/lib/db";
import { getList, isManager } from "@/lib/access";
import { categoryIcon } from "@/lib/categories";
import { RANK_ORDER } from "@/lib/wishes";
import type { Item } from "@/lib/types";
import { saveRanks } from "../../../actions/items";
import { RankList } from "@/components/RankList";
import { Flash, type SP } from "@/components/Flash";

export const metadata = { title: "Rank wishes" };

export default async function RankPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const user = await requireUser();
  const list = getList(Number((await params).id));
  if (!list || !isManager(user.id, list)) notFound();
  const items = all<Item>(`SELECT * FROM items WHERE list_id = ? AND archived_at IS NULL AND surprise = 0 ORDER BY ${RANK_ORDER}`, list.id);
  return (
    <div className="narrow-720">
      <Flash searchParams={searchParams} />
      <p className="small m0"><Link href={`/lists/${list.id}`}>← {list.title}</Link></p>
      <h1>↕️ Rank the wishes</h1>
      <p className="muted">Put the one {list.profile_is_primary && list.owner_user_id === user.id ? "you want" : `${list.profile_name} wants`} most at the top. Drag the ⠿ handle, or use the arrows. Shoppers see the list in this order under &quot;Most wanted&quot;, and wishes added later go to the bottom until you rank them.</p>
      {items.length < 2 ? (
        <div className="card empty">Add a couple of wishes first.</div>
      ) : (
        <RankList
          listId={list.id}
          action={saveRanks}
          rows={items.map((i) => ({ id: i.id, title: i.title, image: i.image_url, icon: categoryIcon(i.category), must: !!i.must_have }))}
        />
      )}
    </div>
  );
}
