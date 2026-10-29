"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { storeSearch } from "@/lib/scrape/stores";
import type { ChatView } from "@/app/actions/chat";
import type { ChatIdea, ProfileTip } from "@/lib/giftchat";
import { Avatar, GIFT_RACCOON } from "./Avatar";

function Helper({ children }: { children: React.ReactNode }) {
  return (
    <div className="chat-row">
      <Avatar id={GIFT_RACCOON} size={40} title="Gift Raccoon" />
      {children}
    </div>
  );
}

type Actions = {
  send: (listId: number, text: string) => Promise<{ ok: true; messages: ChatView[] } | { ok: false; error: string }>;
  clear: (listId: number) => Promise<ChatView[]>;
  toReview: (listId: number, idea: ChatIdea) => Promise<{ ok: boolean; message: string }>;
  saveTip: (listId: number, tip: ProfileTip) => Promise<{ ok: boolean; message: string }>;
};

// Tiny, safe formatter: paragraphs, "-" bullets and **bold**. Everything else is plain text.
function Rich({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  const inline = (line: string, k: number) => (
    <span key={k}>
      {line.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <span key={i}>{part}</span>,
      )}
    </span>
  );
  return (
    <>
      {blocks.map((b, i) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
          return <ul key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*•]\s+/, ""), j)}</li>)}</ul>;
        }
        return <p key={i}>{lines.map((l, j) => <span key={j}>{inline(l, j)}{j < lines.length - 1 && <br />}</span>)}</p>;
      })}
    </>
  );
}

const STARTERS = [
  "What would make a great gift this year?",
  "Ideas under $30?",
  "Something that isn't more toys",
  "What's popular for this age right now?",
];

export function ChatBox({ listId, initial, name, canManage, canEditProfile, actions }: {
  listId: number; initial: ChatView[]; name: string; canManage: boolean; canEditProfile: boolean; actions: Actions;
}) {
  const [messages, setMessages] = useState(initial);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  function send(text: string) {
    const t = text.trim();
    if (!t || pending) return;
    setError(null);
    setDraft("");
    setMessages((m) => [...m, { id: -Date.now(), role: "user", body: t, ideas: [] }]);
    start(async () => {
      const r = await actions.send(listId, t);
      if (r.ok) setMessages(r.messages);
      else {
        setError(r.error);
        setDraft(t);
      }
    });
  }

  function act(key: string, fn: () => Promise<{ ok: boolean; message: string }>) {
    setDone((d) => ({ ...d, [key]: "…" }));
    start(async () => {
      const r = await fn();
      setDone((d) => ({ ...d, [key]: r.message }));
    });
  }

  return (
    <div className="chat">
      <div className="chat-log">
        {messages.length === 0 && (
          <Helper><div className="chat-msg assistant">
            <p>Hi! I&apos;m Gift Raccoon, your gift helper. Tell me a bit about what {name} is into, or ask me anything, and we&apos;ll find something perfect together.</p>
          </div></Helper>
        )}
        {messages.map((m) => {
          const bubble = (
          <div key={m.id} className={`chat-msg ${m.role}`}>
            <Rich text={m.body} />
            {m.ideas.length > 0 && (
              <div className="chat-ideas">
                {m.ideas.map((idea, i) => {
                  const key = `${m.id}-${i}`;
                  const link = storeSearch(idea.store, idea.search || idea.title);
                  return (
                    <div key={key} className="chat-idea">
                      <div>
                        <strong>{idea.title}</strong>
                        {idea.price ? <span className="pill" style={{ marginLeft: 6 }}>~${idea.price.toFixed(0)}</span> : null}
                        {idea.why && <div className="small muted">{idea.why}</div>}
                      </div>
                      <div className="row" style={{ gap: 6 }}>
                        <a className="btn small ghost" href={link.url} target="_blank" rel="noopener noreferrer nofollow">Find at {link.store} ↗</a>
                        {canManage && (
                          done[key] ? <span className="tiny muted">{done[key]}</span> : (
                            <button className="btn small" type="button" onClick={() => act(key, () => actions.toReview(listId, idea))}>＋ Ideas for review</button>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {m.tip && canEditProfile && (
              <div className="chat-tip">
                <span className="small">
                  💡 Remember for {name}?{" "}
                  {[m.tip.likes && `Loves: ${m.tip.likes}`, m.tip.dislikes && `Skip: ${m.tip.dislikes}`, m.tip.note].filter(Boolean).join(" · ")}
                </span>
                {done[`tip-${m.id}`] ? <span className="tiny muted">{done[`tip-${m.id}`]}</span> : (
                  <button className="btn small secondary" type="button" onClick={() => act(`tip-${m.id}`, () => actions.saveTip(listId, m.tip!))}>Save to profile</button>
                )}
              </div>
            )}
          </div>
          );
          return m.role === "assistant" ? <Helper key={m.id}>{bubble}</Helper> : bubble;
        })}
        {pending && <Helper><div className="chat-msg assistant typing"><span /><span /><span /></div></Helper>}
        <div ref={end} />
      </div>
      {messages.length === 0 && (
        <div className="row chips" style={{ gap: 6 }}>
          {STARTERS.map((s) => <button key={s} type="button" className="pill accent chip-btn" onClick={() => send(s)}>{s}</button>)}
        </div>
      )}
      {error && <p className="alert">{error}</p>}
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(draft); }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(draft); } }}
          placeholder={`Tell me about ${name}, or ask for ideas…`}
          rows={2}
        />
        <button className="btn" disabled={pending || !draft.trim()}>Send</button>
      </form>
      {messages.length > 0 && (
        <button type="button" className="btn small ghost" style={{ alignSelf: "flex-start" }} disabled={pending}
          onClick={() => start(async () => setMessages(await actions.clear(listId)))}>
          Start over
        </button>
      )}
    </div>
  );
}
