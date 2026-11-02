import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { aiConfig, AiError, claudeClient, converse, type ChatTurn, type Usage } from "./ai";
import { getSetting } from "./db";
import { CATEGORIES } from "./categories";
import { SEARCH_STORES } from "./scrape/stores";
import { parseReply, type ChatIdea, type ProfileTip } from "./giftchat";

// Bandit's chat engine: streams a reply, collects gift cards and profile tips, reports usage.
// Claude gets tools, prompt caching, optional web search and a refusal fallback; other
// providers get the whole reply at once with the older fenced-block format.

export type BanditReply = { text: string; ideas: ChatIdea[]; tip?: ProfileTip; usage: Usage; model: string; stopped?: boolean };
export type BanditRequest = { stable: string; context: string; turns: ChatTurn[]; onText: (delta: string) => void; signal?: AbortSignal };

const str = { type: "string" } as const;

const TOOLS: Anthropic.Beta.BetaToolUnion[] = [
  {
    name: "suggest_gifts",
    description: "Show the gifts you just suggested as buttons the shopper can tap to find or save them. Call once per reply, after writing it, with every concrete product you named.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["gifts"],
      properties: {
        gifts: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["title", "why", "price", "store", "search", "category"],
            properties: {
              title: { type: "string", description: "Brand, product and model or set number" },
              why: { type: "string", description: "One line on why it fits" },
              price: { type: "number", description: "Typical price in US dollars, 0 if unsure" },
              store: { type: "string", enum: SEARCH_STORES, description: "Store most likely to carry it" },
              search: { type: "string", description: "Short search phrase that finds this exact product at that store" },
              category: { type: "string", enum: CATEGORIES.map((c) => c.id) },
            },
          },
        },
      },
    },
  },
  {
    name: "remember_about_person",
    description: "Offer to save something lasting the shopper told you about the person (a new interest, something to avoid, a size) to their profile. Use empty strings for anything you didn't learn.",
    strict: true,
    input_schema: {
      type: "object",
      additionalProperties: false,
      required: ["likes", "dislikes", "note"],
      properties: { likes: str, dislikes: str, note: str },
    },
  },
];

export function webSearchEnabled(): boolean {
  return getSetting("ai_web_search") === "1";
}

export function ideasFromTool(input: unknown): ChatIdea[] {
  const gifts = (input as { gifts?: unknown })?.gifts;
  if (!Array.isArray(gifts)) return [];
  return gifts
    .filter((g) => g && typeof g.title === "string" && g.title.trim())
    .slice(0, 8)
    .map((g) => ({
      title: String(g.title).slice(0, 200),
      why: String(g.why ?? "").slice(0, 300),
      price: Number(g.price) > 0 ? Number(g.price) : undefined,
      store: typeof g.store === "string" ? g.store : undefined,
      search: typeof g.search === "string" ? g.search.slice(0, 120) : undefined,
      category: typeof g.category === "string" ? g.category : undefined,
    }));
}

export function tipFromTool(input: unknown): ProfileTip | undefined {
  const v = (input ?? {}) as Record<string, unknown>;
  const pick = (k: string) => (typeof v[k] === "string" && (v[k] as string).trim() ? (v[k] as string).trim().slice(0, 200) : undefined);
  const tip = { likes: pick("likes"), dislikes: pick("dislikes"), note: pick("note") };
  return tip.likes || tip.dislikes || tip.note ? tip : undefined;
}

// How an earlier assistant turn is replayed: its text, plus a note of the cards it showed, so
// Bandit remembers what it already suggested without replaying tool calls.
export function replayTurn(text: string, ideas: ChatIdea[]): string {
  return ideas.length ? `${text}\n\n[Shown to the shopper as gift cards: ${ideas.map((i) => i.title).join("; ")}]` : text;
}

// Keep the whole conversation (the cache needs a stable start), trimming the oldest messages in
// blocks of 50 once it passes 200, and always starting on a shopper's message.
export function historyWindow<T extends { role: string }>(turns: T[], max = 200, step = 50): T[] {
  if (turns.length <= max) return turns;
  let start = Math.ceil((turns.length - max) / step) * step;
  while (start < turns.length && turns[start].role !== "user") start++;
  return turns.slice(start);
}

const MAX_ROUNDS = 4;

async function claudeReply(req: BanditRequest): Promise<BanditReply> {
  const c = aiConfig();
  const client = claudeClient(c.apiKey);
  const web = webSearchEnabled();
  const messages: Anthropic.Beta.BetaMessageParam[] = req.turns.map((t) => ({ role: t.role, content: t.content }));
  const usage: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, webSearches: 0 };
  let text = "";
  let ideas: ChatIdea[] = [];
  let tip: ProfileTip | undefined;
  let model = c.model;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const stream = client.beta.messages.stream(
      {
        model: c.model,
        max_tokens: 32000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        thinking: { type: "adaptive" },
        output_config: { effort: "medium" },
        // Caches the conversation so far; the system block below caches Bandit's fixed brief.
        cache_control: { type: "ephemeral" },
        system: [
          { type: "text", text: req.stable, cache_control: { type: "ephemeral" } },
          { type: "text", text: req.context },
        ],
        tools: web ? [...TOOLS, { type: "web_search_20260209", name: "web_search", max_uses: 3 }] : TOOLS,
        messages,
      },
      { signal: req.signal },
    );
    let started = false;
    stream.on("text", (delta) => {
      if (!started && text) req.onText("\n\n");
      started = true;
      req.onText(delta);
    });
    const msg = await stream.finalMessage();
    model = msg.model;
    usage.input += msg.usage.input_tokens;
    usage.output += msg.usage.output_tokens;
    usage.cacheRead += msg.usage.cache_read_input_tokens ?? 0;
    usage.cacheWrite += msg.usage.cache_creation_input_tokens ?? 0;
    usage.webSearches += msg.usage.server_tool_use?.web_search_requests ?? 0;

    const toolUses: Anthropic.Beta.BetaToolUseBlock[] = [];
    let roundText = "";
    for (const b of msg.content) {
      if (b.type === "text") roundText += b.text;
      if (b.type === "tool_use") toolUses.push(b);
    }
    if (roundText) text = text ? `${text}\n\n${roundText}` : roundText;
    for (const t of toolUses) {
      if (t.name === "suggest_gifts") ideas = [...ideas, ...ideasFromTool(t.input)].slice(0, 8);
      if (t.name === "remember_about_person") tip = tipFromTool(t.input) ?? tip;
    }

    if (msg.stop_reason === "refusal") throw new AiError("Bandit can't help with that one. Try asking another way.");
    // Web search paused a long turn: send it back as-is to let Claude carry on.
    if (msg.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: msg.content });
      continue;
    }
    // Claude called a tool before writing anything: tell it the cards are shown and let it talk.
    if (msg.stop_reason === "tool_use" && !roundText.trim()) {
      messages.push({ role: "assistant", content: msg.content });
      messages.push({
        role: "user",
        content: toolUses.map((t) => ({ type: "tool_result" as const, tool_use_id: t.id, content: "Shown to the shopper." })),
      });
      continue;
    }
    break;
  }
  return { text, ideas, tip, usage, model };
}

async function otherReply(req: BanditRequest): Promise<BanditReply> {
  const raw = await converse(`${req.stable}\n\n${req.context}`, req.turns, { signal: req.signal });
  const { body, ideas, tip } = parseReply(raw);
  req.onText(body);
  return { text: body, ideas, tip, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, webSearches: 0 }, model: aiConfig().model };
}

export function banditMode(): "tools" | "fenced" {
  return aiConfig().provider === "anthropic" ? "tools" : "fenced";
}

export async function banditReply(req: BanditRequest): Promise<BanditReply> {
  return banditMode() === "tools" ? claudeReply(req) : otherReply(req);
}
