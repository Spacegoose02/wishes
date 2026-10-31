"use client";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { storeSearch } from "@/lib/scrape/stores";
import type { ChatView } from "@/app/actions/chat";
import type { ChatIdea, ProfileTip } from "@/lib/giftchat";
import { AGENT_NAME, Avatar, GIFT_RACCOON } from "./Avatar";

function Helper({ children }: { children: React.ReactNode }) {
  return (
    <div className="chat-row">
      <Avatar id={GIFT_RACCOON} size={40} title={AGENT_NAME} />
      {children}
    </div>
  );
}

type Actions = {
  clear: (listId: number) => Promise<ChatView[]>;
  toReview: (listId: number, idea: ChatIdea) => Promise<{ ok: boolean; message: string }>;
  saveTip: (listId: number, tip: ProfileTip) => Promise<{ ok: boolean; message: string }>;
};

type StreamEvent = { type: "text"; text: string } | { type: "done"; user: ChatView; reply: ChatView } | { type: "error"; error: string };

// Tiny, safe formatter: paragraphs, "-" and "1." lists, **bold** and plain https links.
// Everything else is plain text.
function Inline({ line }: { line: string }) {
  return (
    <>
      {line.split(/(\*\*[^*]+\*\*|https:\/\/[^\s)<>\]]+)/).map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) return <strong key={i}>{part.slice(2, -2)}</strong>;
        if (part.startsWith("https://")) {
          const url = part.replace(/[.,!?;:]+$/, "");
          return (
            <span key={i}>
              <a href={url} target="_blank" rel="noopener noreferrer nofollow">{url.replace(/^https:\/\/(www\.)?/, "").slice(0, 40)}</a>
              {part.slice(url.length)}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

const BULLET = /^\s*[-*•]\s+/;
const NUMBER = /^\s*\d+[.)]\s+/;

function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((b, i) => {
        const lines = b.split("\n").filter((l) => l.trim());
        if (!lines.length) return null;
        if (lines.every((l) => BULLET.test(l))) {
          return <ul key={i}>{lines.map((l, j) => <li key={j}><Inline line={l.replace(BULLET, "")} /></li>)}</ul>;
        }
        if (lines.every((l) => NUMBER.test(l))) {
          return <ol key={i}>{lines.map((l, j) => <li key={j}><Inline line={l.replace(NUMBER, "")} /></li>)}</ol>;
        }
        return <p key={i}>{lines.map((l, j) => <span key={j}><Inline line={l} />{j < lines.length - 1 && <br />}</span>)}</p>;
      })}
    </>
  );
}

// Reads the server's newline-delimited JSON events as they arrive.
async function* events(res: Response): AsyncGenerator<StreamEvent> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buf += decoder.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) yield JSON.parse(line) as StreamEvent;
    }
    if (done) return;
  }
}

export function ChatBox({ listId, initial, name, starters, canManage, canEditProfile, actions }: {
  listId: number; initial: ChatView[]; name: string; starters: string[]; canManage: boolean; canEditProfile: boolean; actions: Actions;
}) {
  const [messages, setMessages] = useState(initial);
  const [draft, setDraft] = useState("");
  const [live, setLive] = useState<string | null>(null);
  const [error, setError] = useState<{ text: string; retry?: string } | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [confirmClear, setConfirmClear] = useState(false);
  const [busy, start] = useTransition();
  const abort = useRef<AbortController | null>(null);
  // Ids for messages not saved yet; negative so they never clash with real ones.
  const tempIds = useRef(0);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const sending = live !== null;

  // Follow the conversation as it grows, unless the shopper scrolled up to read.
  // On phones the log grows with the page instead, so follow the page.
  useEffect(() => {
    const el = log.current;
    if (!el) return;
    if (el.scrollHeight > el.clientHeight + 1) {
      if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTo({ top: el.scrollHeight });
    } else if (messages.length > initial.length || live !== null) {
      const page = document.documentElement;
      if (page.scrollHeight - window.scrollY - window.innerHeight < 320) window.scrollTo({ top: page.scrollHeight });
    }
  }, [messages, live, initial.length]);

  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [draft]);

  useEffect(() => {
    if (!confirmClear) return;
    const t = setTimeout(() => setConfirmClear(false), 4000);
    return () => clearTimeout(t);
  }, [confirmClear]);

  useEffect(() => () => abort.current?.abort(), []);

  async function send(text: string) {
    const t = text.trim();
    if (!t || sending) return;
    setError(null);
    setDraft("");
    const tempId = --tempIds.current;
    setMessages((m) => [...m, { id: tempId, role: "user", body: t, ideas: [] }]);
    setLive("");
    const ctrl = new AbortController();
    abort.current = ctrl;
    let streamed = "";
    const fail = (msg: string) => {
      setMessages((m) => m.filter((x) => x.id !== tempId));
      setError({ text: msg, retry: t });
    };
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ listId, text: t }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        return fail(body?.error ?? "Bandit couldn't answer just now. Try again in a moment.");
      }
      let finished = false;
      for await (const ev of events(res)) {
        if (ev.type === "text") {
          streamed += ev.text;
          setLive(streamed);
        } else if (ev.type === "done") {
          finished = true;
          setMessages((m) => [...m.filter((x) => x.id !== tempId), ev.user, ev.reply]);
        } else {
          finished = true;
          fail(ev.error);
        }
      }
      if (!finished) fail("The connection dropped before Bandit finished. Try again?");
    } catch {
      if (ctrl.signal.aborted) {
        // The server keeps what Bandit had written so far; show the same here.
        if (streamed.trim()) setMessages((m) => [...m, { id: --tempIds.current, role: "assistant", body: streamed, ideas: [], stopped: true }]);
        else setMessages((m) => m.filter((x) => x.id !== tempId));
      } else fail("Couldn't reach Bandit. Check your connection and try again.");
    } finally {
      abort.current = null;
      setLive(null);
      input.current?.focus();
    }
  }

  function act(key: string, fn: () => Promise<{ ok: boolean; message: string }>) {
    setDone((d) => ({ ...d, [key]: "…" }));
    start(async () => {
      const r = await fn();
      setDone((d) => ({ ...d, [key]: r.message }));
    });
  }

  function clear() {
    if (!confirmClear) return setConfirmClear(true);
    setConfirmClear(false);
    start(async () => {
      setMessages(await actions.clear(listId));
      setDone({});
      setError(null);
    });
  }

  return (
    <div className="chat">
      <div className="chat-log" ref={log} role="log" aria-label={`Chat with ${AGENT_NAME}`}>
        {messages.length === 0 && (
          <Helper><div className="chat-msg assistant">
            <p>Hi, I&apos;m {AGENT_NAME}! <span aria-hidden="true">🦝🎁</span> I&apos;m a raccoon with a nose for great gifts. Tell me a bit about what {name} is into, or ask me anything, and we&apos;ll find something perfect together.</p>
          </div></Helper>
        )}
        {messages.map((m) => {
          const bubble = (
          <div key={m.id} className={`chat-msg ${m.role}`}>
            <Rich text={m.body} />
            {m.stopped && <p className="tiny muted">(stopped)</p>}
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
                      <div className="row gap-6">
                        <a className="btn small ghost" href={link.url} target="_blank" rel="noopener noreferrer nofollow">Find at {link.store} <span aria-hidden="true">↗</span></a>
                        {canManage && m.id > 0 && (
                          done[key] ? <span className="tiny muted" role="status">{done[key]}</span> : (
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
                  <span aria-hidden="true">💡</span> Remember for {name}?{" "}
                  {[m.tip.likes && `Loves: ${m.tip.likes}`, m.tip.dislikes && `Skip: ${m.tip.dislikes}`, m.tip.note].filter(Boolean).join(" · ")}
                </span>
                {done[`tip-${m.id}`] ? <span className="tiny muted" role="status">{done[`tip-${m.id}`]}</span> : (
                  <button className="btn small secondary" type="button" onClick={() => act(`tip-${m.id}`, () => actions.saveTip(listId, m.tip!))}>Save to profile</button>
                )}
              </div>
            )}
          </div>
          );
          return m.role === "assistant" ? <Helper key={m.id}>{bubble}</Helper> : bubble;
        })}
        {sending && (
          <Helper>
            {live ? (
              <div className="chat-msg assistant" aria-busy="true"><Rich text={live} /></div>
            ) : (
              <div className="chat-msg assistant typing" aria-label={`${AGENT_NAME} is sniffing around for ideas`}>
                <span /><span /><span />
                <em className="tiny muted">sniffing around…</em>
              </div>
            )}
          </Helper>
        )}
      </div>
      {/* Screen readers hear the finished reply once, not every streamed word. */}
      <p className="sr-only" aria-live="polite">{!sending && messages.at(-1)?.role === "assistant" ? messages.at(-1)!.body : ""}</p>
      {messages.length === 0 && !sending && (
        <div className="row chips gap-6">
          {starters.map((s) => <button key={s} type="button" className="pill accent chip-btn" onClick={() => send(s)}>{s}</button>)}
        </div>
      )}
      {error && (
        <div className="alert row gap-6" role="alert">
          <span>{error.text}</span>
          {error.retry && <button type="button" className="btn small secondary" onClick={() => send(error.retry!)}>Try again</button>}
        </div>
      )}
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send(draft); }}>
        <label htmlFor={`chat-${listId}`} className="sr-only">Message {AGENT_NAME}</label>
        <textarea
          id={`chat-${listId}`}
          ref={input}
          value={draft}
          maxLength={2000}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(draft); } }}
          placeholder={`Tell me about ${name}, or ask for ideas…`}
          rows={1}
        />
        {sending ? (
          <button className="btn secondary" type="button" onClick={() => abort.current?.abort()}>Stop</button>
        ) : (
          <button className="btn" disabled={!draft.trim()}>Send</button>
        )}
      </form>
      {messages.length > 0 && (
        <button type="button" className={`btn small ghost${confirmClear ? " is-armed" : ""}`} style={{ alignSelf: "flex-start" }} disabled={busy || sending} onClick={clear}>
          {confirmClear ? "Erase this chat?" : "Start over"}
        </button>
      )}
    </div>
  );
}
