import Link from "next/link";
import { canEditProfile, isManager, type ListWithOwner } from "@/lib/access";
import { get } from "@/lib/db";
import { aiEnabled } from "@/lib/ai";
import type { Profile, User } from "@/lib/types";
import { chatIdeaToReview, clearChat, loadChat, saveChatTip, sendChat } from "@/app/actions/chat";
import { ChatBox } from "./ChatBox";
import { AboutProfile } from "./AboutProfile";

// Bandit's chat for one list: the person's facts on top, the conversation below.
export async function GiftChatPanel({ user, list }: { user: User; list: ListWithOwner }) {
  const profile = get<Profile>("SELECT * FROM profiles WHERE id = ?", list.profile_id)!;
  const editable = canEditProfile(user.id, profile);
  return (
    <>
      <AboutProfile p={profile} editHref={editable ? (profile.is_primary ? "/settings?tab=me" : `/settings?tab=profiles&edit=${profile.id}#profile-${profile.id}`) : undefined} />
      {aiEnabled() ? (
        <div className="card" style={{ marginTop: 12 }}>
          <ChatBox
            key={list.id}
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
          Bandit needs AI turned on. {user.is_admin ? <Link href="/settings?tab=admin">Turn it on in Settings → Server.</Link> : "Ask your admin to turn it on."}
        </div>
      )}
    </>
  );
}
