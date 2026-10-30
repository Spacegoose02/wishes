import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { get } from "@/lib/db";
import { getList, listAccess, myLists, sharedWithMe } from "@/lib/access";
import { Avatar, AGENT_NAME, GIFT_RACCOON } from "@/components/Avatar";
import { GiftChatPanel } from "@/components/GiftChatPanel";
import type { SP } from "@/components/Flash";

export const metadata = { title: "Gift helper" };

// Chat tab: pick who you're shopping for, then talk it through with Bandit.
export default async function ChatTab({ searchParams }: { searchParams: SP }) {
  const user = await requireUser();
  const sp = await searchParams;
  const lists = [...myLists(user.id), ...sharedWithMe(user.id)];
  const recent = get<{ list_id: number }>("SELECT list_id FROM chat_messages WHERE user_id = ? ORDER BY id DESC LIMIT 1", user.id)?.list_id;
  const wanted = Number(sp.list) || recent || lists[0]?.id;
  const list = wanted ? getList(wanted) : undefined;
  const current = list && listAccess(user, list) !== "none" ? list : undefined;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <div className="row" style={{ marginBottom: 10 }}>
        <Avatar id={GIFT_RACCOON} size={64} title={AGENT_NAME} />
        <div>
          <h1 style={{ margin: 0 }}>Chat with {AGENT_NAME}</h1>
          <p className="muted small" style={{ margin: 0 }}>Bandit the gift raccoon helps you find the perfect present. Your chats are private to you.</p>
        </div>
      </div>

      {lists.length === 0 ? (
        <div className="card empty"><div className="big">🦝</div>Make a list or join a family first, then Bandit can help shop for someone.</div>
      ) : (
        <>
          <p className="small" style={{ fontWeight: 700, margin: "8px 0 6px" }}>Who are we shopping for?</p>
          <div className="row chips" style={{ gap: 6 }}>
            {lists.map((l) => (
              <Link key={l.id} href={`/chat?list=${l.id}`} className={`pill chat-pick ${current?.id === l.id ? "accent" : ""}`}>
                <Avatar id={l.profile_avatar} size={20} /> {l.profile_name} · {l.title}
              </Link>
            ))}
          </div>
          {current && (
            <div style={{ marginTop: 12 }}>
              <p className="small muted" style={{ margin: 0 }}>
                Talking about <Link href={`/lists/${current.id}`}>{current.title}</Link>
              </p>
              <GiftChatPanel user={user} list={current} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
