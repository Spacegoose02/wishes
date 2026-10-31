import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getSetting } from "./db";
import { CATEGORIES } from "./categories";
import { SEARCH_STORES } from "./scrape/stores";

// Optional AI gift ideas. Every provider returns plain suggestions that are stored for
// review; nothing is ever added to a list automatically.

export type AiProvider = "none" | "anthropic" | "openai" | "gemini" | "meta" | "local";

export const PROVIDERS: { id: AiProvider; label: string; defaultModel: string; defaultBaseUrl?: string; needsKey: boolean }[] = [
  { id: "none", label: "Off", defaultModel: "", needsKey: false },
  { id: "anthropic", label: "Claude (Anthropic)", defaultModel: "claude-opus-5-5", needsKey: true },
  { id: "openai", label: "OpenAI", defaultModel: "gpt-5-mini", defaultBaseUrl: "https://api.openai.com/v1", needsKey: true },
  { id: "gemini", label: "Google Gemini", defaultModel: "gemini-2.5-flash", needsKey: true },
  { id: "meta", label: "Meta Llama API", defaultModel: "Llama-4-Maverick-17B-128E-Instruct-FP8", defaultBaseUrl: "https://api.llama.com/compat/v1", needsKey: true },
  { id: "local", label: "Local LLM (Ollama, LM Studio, any OpenAI-compatible)", defaultModel: "llama3.2", defaultBaseUrl: "http://ollama:11434/v1", needsKey: false },
];

// Current Claude models for the Admin picker, with list prices per million tokens.
export const CLAUDE_MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 (best gift sense, default)", input: 4, output: 20, cacheRead: 0.2 },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 (about half the price)", input: 2, output: 10, cacheRead: 0.2 },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (cheapest, less thoughtful)", input: 0.1, output: 0.5, cacheRead: 0.01 },
] as const;
const WEB_SEARCH_USD = 0.01;

export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number; webSearches: number };

// Estimated US dollars for one reply. Cache writes cost 1.25x input. Unknown models count as Opus.
export function estimateCost(model: string, u: Usage): number {
  const m = CLAUDE_MODELS.find((x) => x.id === model) ?? CLAUDE_MODELS[0];
  return (u.input * m.input + u.cacheWrite * m.input * 1.25 + u.cacheRead * m.cacheRead + u.output * m.output) / 1e6 + u.webSearches * WEB_SEARCH_USD;
}

export type AiConfig = { provider: AiProvider; model: string; apiKey: string; baseUrl: string };

export function aiConfig(): AiConfig {
  const provider = (getSetting("ai_provider") || process.env.AI_PROVIDER || "none") as AiProvider;
  const meta = PROVIDERS.find((p) => p.id === provider) ?? PROVIDERS[0];
  return {
    provider: meta.id,
    model: getSetting("ai_model") || process.env.AI_MODEL || meta.defaultModel,
    apiKey: getSetting("ai_api_key") || process.env.AI_API_KEY || "",
    baseUrl: (getSetting("ai_base_url") || process.env.AI_BASE_URL || meta.defaultBaseUrl || "").replace(/\/$/, ""),
  };
}

export function aiEnabled(): boolean {
  const c = aiConfig();
  const meta = PROVIDERS.find((p) => p.id === c.provider)!;
  return c.provider !== "none" && (!meta.needsKey || !!c.apiKey);
}

export type Idea = { title: string; reason: string; est_price?: number; store?: string; search?: string; category?: string };

export type IdeaContext = {
  about?: string;
  listTitle: string;
  occasion: string;
  forName: string;
  age?: number;
  existing: string[];
  hint?: string;
};

function prompt(ctx: IdeaContext): string {
  return [
    `Suggest 6 gift ideas for ${ctx.forName}${ctx.age ? ` (age ${ctx.age})` : ""}.`,
    ctx.about ? "What the family told us about them:\n" + ctx.about : "",
    `Their wishlist is called "${ctx.listTitle}"${ctx.occasion ? ` for ${ctx.occasion}` : ""}.`,
    ctx.existing.length ? `Items already on the list:\n- ${ctx.existing.slice(0, 40).join("\n- ")}` : "The list is empty so far.",
    ctx.hint ? `Extra guidance from the user: ${ctx.hint}` : "",
    "Suggest things that fit their tastes but are not duplicates. Name a specific, real product that is sold today: brand plus product name and model or set number where there is one (e.g. 'LEGO Botanicals Bonsai Tree 10281', not 'a LEGO set').",
    `For each idea pick the store most likely to carry it from: ${SEARCH_STORES.join(", ")}. Give a short search phrase that finds that exact product there, and a category id from: ${CATEGORIES.map((c) => c.id).join(", ")}.`,
    'Reply with only JSON in this shape: {"ideas":[{"title":"...","reason":"one short sentence","est_price":25,"store":"Target","search":"lego botanical bonsai 10281","category":"toys"}]}',
  ]
    .filter(Boolean)
    .join("\n\n");
}

function parseIdeas(text: string): Idea[] {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("The AI reply wasn't in the expected format.");
  const data = JSON.parse(m[0]) as { ideas?: Idea[] };
  return (data.ideas ?? [])
    .filter((i) => i && typeof i.title === "string" && i.title.trim())
    .slice(0, 10)
    .map((i) => ({
      title: i.title.trim().slice(0, 200),
      reason: String(i.reason ?? "").slice(0, 400),
      est_price: Number(i.est_price) || undefined,
      store: typeof i.store === "string" ? i.store.slice(0, 40) : undefined,
      search: typeof i.search === "string" ? i.search.slice(0, 120) : undefined,
      category: typeof i.category === "string" ? i.category : undefined,
    }));
}

export type ChatTurn = { role: "user" | "assistant"; content: string };

async function openAiCompatible(c: AiConfig, system: string, turns: ChatTurn[]): Promise<string> {
  const messages = [...(system ? [{ role: "system", content: system }] : []), ...turns];
  const res = await fetch(c.baseUrl + "/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", ...(c.apiKey ? { authorization: "Bearer " + c.apiKey } : {}) },
    body: JSON.stringify({ model: c.model, messages }),
  });
  if (!res.ok) throw new Error("AI request failed (" + res.status + "): " + (await res.text()).slice(0, 200));
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return data.choices?.[0]?.message?.content ?? "";
}

async function gemini(c: AiConfig, system: string, turns: ChatTurn[], json: boolean): Promise<string> {
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(c.model) + ":generateContent",
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": c.apiKey },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: turns.map((t) => ({ role: t.role === "assistant" ? "model" : "user", parts: [{ text: t.content }] })),
        ...(json ? { generationConfig: { responseMimeType: "application/json" } } : {}),
      }),
    },
  );
  if (!res.ok) throw new Error("AI request failed (" + res.status + "): " + (await res.text()).slice(0, 200));
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
}

// One client per API key, reused across requests (keeps connections warm).
const clients = new Map<string, Anthropic>();
export function claudeClient(apiKey: string): Anthropic {
  let c = clients.get(apiKey);
  if (!c) clients.set(apiKey, (c = new Anthropic({ apiKey })));
  return c;
}

export class AiError extends Error {}

// Turns SDK errors into messages a family member can act on.
export function friendlyError(e: unknown): string {
  if (e instanceof AiError) return e.message;
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return "The Claude API key isn't working. An admin can check it in Settings → Server.";
  if (e instanceof Anthropic.RateLimitError) return "Bandit is answering a lot of questions right now. Try again in a minute.";
  if (e instanceof Anthropic.NotFoundError) return "That AI model isn't available. An admin can pick another in Settings → Server.";
  if (e instanceof Anthropic.APIConnectionError) return "Couldn't reach Claude. Check the server's internet connection.";
  if (e instanceof Anthropic.APIError && (e.status === 529 || (e.status ?? 0) >= 500)) return "Claude is busy right now. Try again in a moment.";
  if (e instanceof Anthropic.BadRequestError) return "Claude couldn't handle that request. Try rephrasing, or start over.";
  return e instanceof Error ? e.message : "Something went wrong talking to the AI.";
}

// Single-shot Claude call. With a schema, the reply is guaranteed to be JSON matching it.
async function claude(c: AiConfig, system: string, turns: ChatTurn[], schema?: Record<string, unknown>): Promise<string> {
  const response = await claudeClient(c.apiKey).beta.messages.create({
    model: c.model,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", ...(schema ? { format: { type: "json_schema", schema } } : {}) },
    ...(system ? { system } : {}),
    messages: turns,
  });
  if (response.stop_reason === "refusal") throw new AiError("Claude declined this request.");
  return response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}

// One entry point for every provider. Claude gets a strict JSON schema when one is given;
// the others are asked for JSON in the prompt.
export async function converse(system: string, turns: ChatTurn[], opts: { json?: boolean; schema?: Record<string, unknown> } = {}): Promise<string> {
  const c = aiConfig();
  switch (c.provider) {
    case "anthropic":
      return claude(c, system, turns, opts.schema);
    case "gemini":
      return gemini(c, system, turns, !!opts.json);
    case "openai":
    case "meta":
    case "local":
      return openAiCompatible(c, system, turns);
    default:
      throw new Error("AI is turned off. An admin can enable it in Settings → Server.");
  }
}

async function complete(text: string, schema?: Record<string, unknown>): Promise<string> {
  return converse("", [{ role: "user", content: text }], { json: true, schema });
}

const str = { type: "string" } as const;
const IDEAS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ideas"],
  properties: {
    ideas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "reason", "est_price", "store", "search", "category"],
        properties: { title: str, reason: str, est_price: { type: "number" }, store: { type: "string", enum: SEARCH_STORES }, search: str, category: { type: "string", enum: CATEGORIES.map((c) => c.id) } },
      },
    },
  },
};
const SAME_SCHEMA = { type: "object", additionalProperties: false, required: ["same"], properties: { same: { type: "array", items: { type: "integer" } } } };

export async function generateIdeas(ctx: IdeaContext): Promise<{ ideas: Idea[]; source: string }> {
  const c = aiConfig();
  return { ideas: parseIdeas(await complete(prompt(ctx), IDEAS_SCHEMA)), source: c.provider + ":" + c.model };
}

// Ask the model which store listings are the same product as the wish (same item, size and
// pack count). Returns the indexes it accepts, or null when AI isn't available.
export async function confirmMatches(wish: string, details: string, candidates: { store: string; title: string; price: string }[]): Promise<number[] | null> {
  if (!aiEnabled() || candidates.length === 0) return null;
  const list = candidates.map((o, i) => i + ". [" + o.store + ", " + o.price + "] " + o.title).join("\n");
  const text = [
    "A shopper wants this exact item: \"" + wish + "\"" + (details ? " (" + details + ")" : "") + ".",
    "Which of these store listings are the same product (same brand, model, size or pack count)? Accessories, cases, refurbished, used, or different pack sizes do not count.",
    list,
    'Reply with only JSON: {"same":[0,2]}',
  ].join("\n\n");
  try {
    const reply = await complete(text, SAME_SCHEMA);
    const m = reply.match(/\{[\s\S]*\}/);
    const data = m ? (JSON.parse(m[0]) as { same?: unknown[] }) : {};
    return (data.same ?? []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < candidates.length);
  } catch {
    return null;
  }
}
