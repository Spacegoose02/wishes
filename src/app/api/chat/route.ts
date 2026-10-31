import { getUser } from "@/lib/auth";
import { get } from "@/lib/db";
import { getList, isRecipient, listAccess } from "@/lib/access";
import { aiEnabled, friendlyError, type ChatTurn } from "@/lib/ai";
import { banditMode, banditReply, historyWindow, replayTurn } from "@/lib/bandit";
import { addAssistantMessage, addUserMessage, chatView, chatViews, dailyCap, deleteMessage, sentToday } from "@/lib/chatstore";
import { chatContext, giverContext, stableBrief } from "@/lib/giftchat";
import type { Profile } from "@/lib/types";

export const dynamic = "force-dynamic";

// Streams one Bandit reply as newline-delimited JSON:
//   {"type":"text","text":"..."}  pieces of the reply as they're written
//   {"type":"done","user":ChatView,"reply":ChatView}
//   {"type":"error","error":"..."}
export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Please sign in again." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { listId?: unknown; text?: unknown };
  const list = getList(Number(body.listId));
  if (!list || listAccess(user, list) === "none") return Response.json({ error: "List not found." }, { status: 404 });
  const text = String(body.text ?? "").trim().slice(0, 2000);
  if (!text) return Response.json({ error: "Type a message first." }, { status: 400 });
  if (!aiEnabled()) return Response.json({ error: "Bandit needs AI turned on in Settings → Server." }, { status: 400 });
  const cap = dailyCap();
  if (cap && sentToday(user.id) >= cap) {
    return Response.json({ error: `You've reached today's limit of ${cap} messages to Bandit. He'll be back tomorrow!` }, { status: 429 });
  }

  const profile = get<Profile>("SELECT * FROM profiles WHERE id = ?", list.profile_id)!;
  const recipient = isRecipient(user.id, list);
  const userMsgId = addUserMessage(list.id, user.id, text);
  const turns: ChatTurn[] = historyWindow(chatViews(list.id, user.id)).map((m) => ({
    role: m.role,
    content: m.role === "assistant" ? replayTurn(m.body || "(no reply)", m.ideas) : m.body,
  }));

  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      async start(controller) {
        const send = (o: object) => {
          try {
            controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
          } catch {
            /* the browser went away */
          }
        };
        let streamed = "";
        try {
          const r = await banditReply({
            stable: stableBrief(banditMode()),
            context: chatContext(list, profile, user.name, recipient, recipient ? undefined : giverContext(user, list)),
            turns,
            signal: req.signal,
            onText: (t) => {
              streamed += t;
              send({ type: "text", text: t });
            },
          });
          const id = addAssistantMessage(list.id, user.id, { ...r, text: r.text || streamed || "Sorry, I lost my train of thought. Could you say that again?" });
          send({ type: "done", user: chatView(userMsgId), reply: chatView(id) });
        } catch (e) {
          if (req.signal.aborted) {
            // Stopped by the shopper: keep what Bandit had said so far.
            if (streamed.trim()) addAssistantMessage(list.id, user.id, { text: streamed, ideas: [], stopped: true, model: "", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, webSearches: 0 } });
            else deleteMessage(userMsgId);
          } else {
            deleteMessage(userMsgId);
            console.error("Bandit chat failed", e);
            send({ type: "error", error: friendlyError(e) });
          }
        } finally {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      },
    }),
    { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } },
  );
}
