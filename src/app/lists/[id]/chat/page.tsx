import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { canEditProfile, getList, isManager, listAccess } from "@/lib/access";
import { get } from "@/lib/db";
import { aiEnabled } from "@/lib/ai";
import type { Profile } from "@/lib/types";
import { chatIdeaToReview, clearChat, loadChat, saveChatTip, sendChat } from "../../../actions/chat";
import { ChatBox } from "@/components/ChatBox";
import { AboutProfile } from "@/components/AboutProfile";
import { Avatar } from "@/components/Avatar";

export default async function GiftChatPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const list = getList(Number((await params).id));
  if (!list || listAccess(user, list) === "none") notFound();
  const profile = get<Profile>("SELECT * FROM profiles WHERE id = ?", list.profile_id)!;
  const editable = canEditProfile(user.id, profile);
  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <p><Link href={`/lists/${list.id}`}>← Back to {list.title}</Link></p>
      <div className="row" style={{ marginBottom: 8 }}>
        <Avatar id={profile.avatar} size={44} />
        <div>
          <h1 style={{ margin: 0 }}>💬 Gift helper</h1>
          <p className="muted small" style={{ margin: 0 }}>Chat about {profile.name} and find the perfect gift. Your chat is private to you.</p>
        </div>
      </div>
      <AboutProfile p={profile} editHref={editable ? (profile.is_primary ? "/settings?tab=me" : `/settings?tab=profiles&edit=${profile.id}#profile-${profile.id}`) : undefined} />
      {aiEnabled() ? (
        <div className="card" style={{ marginTop: 12 }}>
          <ChatBox
            listId={list.id}
            initial={await loadChat(list.id)}
            name={profile.name}
            canManage={isManager(user.id, list)}
            canEditProfile={editable}
            actions={{ send: sendChat, clear: clearChat, toReview: chatIdeaToReview, saveTip: saveChatTip }}
          />
        </div>
      ) : (
        <div className="card" style={{ marginTop: 12 }}>
          The gift helper needs AI turned on. {user.is_admin ? <Link href="/settings?tab=admin">Turn it on in Settings → Server.</Link> : "Ask your admin to turn it on."}
        </div>
      )}
    </div>
  );
}
