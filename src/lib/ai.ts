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

async function claude(c: AiConfig, system: string, turns: ChatTurn[], effort: "low" | "medium"): Promise<string> {
  const client = new Anthropic({ apiKey: c.apiKey });
  const response = await client.messages.create({
    model: c.model,
    max_tokens: 16000,
    output_config: { effort },
    ...(system ? { system } : {}),
    messages: turns,
  });
  if (response.stop_reason === "refusal") throw new Error("Claude declined this request.");
  return response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}

// One entry point for every provider. Single-shot JSON tasks use low effort; chat uses medium.
export async function converse(system: string, turns: ChatTurn[], opts: { json?: boolean } = {}): Promise<string> {
  const c = aiConfig();
  switch (c.provider) {
    case "anthropic":
      return claude(c, system, turns, opts.json ? "low" : "medium");
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

async function complete(text: string): Promise<string> {
  return converse("", [{ role: "user", content: text }], { json: true });
}

export async function generateIdeas(ctx: IdeaContext): Promise<{ ideas: Idea[]; source: string }> {
  const c = aiConfig();
  return { ideas: parseIdeas(await complete(prompt(ctx))), source: c.provider + ":" + c.model };
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
    const reply = await complete(text);
    const m = reply.match(/\{[\s\S]*\}/);
    const data = m ? (JSON.parse(m[0]) as { same?: unknown[] }) : {};
    return (data.same ?? []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n < candidates.length);
  } catch {
    return null;
  }
}
